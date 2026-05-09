package audio

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/ziegenbeinmarius/theatrico/internal/recognizer"
	ws "github.com/ziegenbeinmarius/theatrico/internal/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type transcriptMsg struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// OnTranscript is called after a successful transcription; the caller uses this
// to run the fuzzy matcher and broadcast a position_update if needed.
type OnTranscript func(text string)

// HandleOperatorAudio upgrades the connection to WebSocket, buffers incoming
// binary audio frames, and flushes to Whisper every chunkDuration.
// Transcripts are sent back to the operator connection, broadcast to the hub,
// and also delivered to onTranscript (which wires into the fuzzy matcher).
func HandleOperatorAudio(w http.ResponseWriter, r *http.Request, sessionID string, rec *recognizer.Recognizer, hub *ws.Hub, chunkDuration time.Duration, onTranscript OnTranscript) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("audio ws upgrade: %v", err)
		return
	}
	defer conn.Close()

	var buf []byte
	var webmInit []byte
	ticker := time.NewTicker(chunkDuration)
	defer ticker.Stop()

	msgs := make(chan []byte, 64)
	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			msgType, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if msgType == websocket.BinaryMessage && len(data) > 0 {
				msgs <- data
			}
		}
	}()

	flush := func(data []byte) {
		if len(data) == 0 {
			return
		}

		payload := data
		if !startsWithWebMHeader(data) && len(webmInit) > 0 {
			payload = append(append(make([]byte, 0, len(webmInit)+len(data)), webmInit...), data...)
		}

		text, err := rec.Transcribe(payload, "webm")
		if err != nil {
			log.Printf("transcribe error: %v", err)
			return
		}
		if text == "" {
			return
		}
		msg, _ := json.Marshal(transcriptMsg{Type: "transcript", Text: text})
		conn.WriteMessage(websocket.TextMessage, msg) //nolint:errcheck
		hub.Broadcast(sessionID, msg)
		if onTranscript != nil {
			onTranscript(text)
		}
	}

	for {
		select {
		case data := <-msgs:
			if len(webmInit) == 0 {
				if init := extractWebMInitSegment(data); len(init) > 0 {
					webmInit = init
				}
			}
			buf = append(buf, data...)
		case <-ticker.C:
			chunk := make([]byte, len(buf))
			copy(chunk, buf)
			buf = buf[:0]
			go flush(chunk)
		case <-done:
			go flush(buf)
			return
		}
	}
}

func startsWithWebMHeader(data []byte) bool {
	if len(data) < 4 {
		return false
	}
	// EBML header magic number.
	return data[0] == 0x1A && data[1] == 0x45 && data[2] == 0xDF && data[3] == 0xA3
}

func extractWebMInitSegment(data []byte) []byte {
	if !startsWithWebMHeader(data) {
		return nil
	}
	clusterMarker := []byte{0x1F, 0x43, 0xB6, 0x75}
	idx := bytes.Index(data, clusterMarker)
	if idx <= 0 {
		return nil
	}
	init := make([]byte, idx)
	copy(init, data[:idx])
	return init
}
