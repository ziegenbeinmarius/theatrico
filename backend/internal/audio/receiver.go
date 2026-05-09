package audio

import (
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

// HandleOperatorAudio upgrades the connection to WebSocket, buffers incoming
// binary audio frames, and flushes to Whisper every chunkDuration.
// Transcripts are sent back to the operator connection and broadcast to the hub.
func HandleOperatorAudio(w http.ResponseWriter, r *http.Request, sessionID string, rec *recognizer.Recognizer, hub *ws.Hub, chunkDuration time.Duration) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("audio ws upgrade: %v", err)
		return
	}
	defer conn.Close()

	var buf []byte
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
		text, err := rec.Transcribe(data, "webm")
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
	}

	for {
		select {
		case data := <-msgs:
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
