package audio

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type transcriptMsg struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type errorMsg struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// Transcriber is satisfied by any type that can transcribe audio bytes to text.
type Transcriber interface {
	Transcribe(audio []byte, format, language, prompt string) (string, error)
}

// Broadcaster is satisfied by any type that can broadcast messages to session clients.
type Broadcaster interface {
	Broadcast(sessionID string, msg []byte)
}

// OnTranscript is called after a successful transcription; the caller uses this
// to run the fuzzy matcher and broadcast a position_update if needed.
type OnTranscript func(text string)

// ScriptContext returns the upcoming script text Whisper should expect.
type ScriptContext func() string

// HandleOperatorAudio upgrades the connection to WebSocket, buffers incoming
// binary audio frames, and flushes to Whisper every chunkDuration.
// Transcripts are sent back to the operator connection, broadcast to the hub,
// and also delivered to onTranscript (which wires into the fuzzy matcher).
// language is an optional ISO-639-1 code passed to Whisper; empty means auto-detect.
func HandleOperatorAudio(w http.ResponseWriter, r *http.Request, sessionID string, rec Transcriber, hub Broadcaster, chunkDuration time.Duration, language string, scriptContext ScriptContext, onTranscript OnTranscript) {
	audioFormat := audioFormatFromRequest(r)
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("audio ws upgrade: %v", err)
		return
	}
	defer conn.Close()

	var buf []byte
	var initSegment []byte
	var writeMu sync.Mutex
	var promptMu sync.Mutex
	var rollingPrompt string
	ticker := time.NewTicker(chunkDuration)
	defer ticker.Stop()

	msgs := make(chan []byte, 64)
	flushNow := make(chan struct{}, 1)
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
			} else if msgType == websocket.TextMessage {
				var signal struct {
					Type string `json:"type"`
				}
				if json.Unmarshal(data, &signal) == nil && signal.Type == "flush" {
					select {
					case flushNow <- struct{}{}:
					default:
					}
				}
			}
		}
	}()

	flush := func(data []byte, initSegment []byte, prompt string) {
		if len(data) == 0 {
			return
		}

		localInit := initSegment
		if len(localInit) == 0 {
			localInit = extractInitSegment(data, audioFormat)
		}

		payload := data
		if !startsWithContainerHeader(data, audioFormat) && len(localInit) > 0 {
			payload = append(append(make([]byte, 0, len(localInit)+len(data)), localInit...), data...)
		}

		text, err := rec.Transcribe(payload, audioFormat, language, prompt)
		if err != nil {
			log.Printf("transcribe error format=%s: %v", audioFormat, err)
			writeJSON(conn, &writeMu, errorMsg{
				Type:    "error",
				Message: "Audio transcription failed. Check the deployed OpenAI API key and microphone format.",
			})
			return
		}
		if text == "" {
			return
		}

		promptMu.Lock()
		combined := rollingPrompt + " " + text
		if len(combined) > 400 {
			combined = combined[len(combined)-400:]
		}
		rollingPrompt = strings.TrimSpace(combined)
		promptMu.Unlock()

		msg, _ := json.Marshal(transcriptMsg{Type: "transcript", Text: text})
		writeMessage(conn, &writeMu, msg)
		hub.Broadcast(sessionID, msg)
		if onTranscript != nil {
			onTranscript(text)
		}
	}

	buildPrompt := func() string {
		promptMu.Lock()
		rolling := rollingPrompt
		promptMu.Unlock()

		const rollingMax = 150
		if len(rolling) > rollingMax {
			rolling = rolling[len(rolling)-rollingMax:]
		}

		scriptLines := ""
		if scriptContext != nil {
			scriptLines = scriptContext()
		}

		if scriptLines == "" {
			return strings.TrimSpace(rolling)
		}
		const totalMax = 400
		available := totalMax - len(rolling) - 1
		if available <= 0 {
			return strings.TrimSpace(rolling)
		}
		if len(scriptLines) > available {
			scriptLines = scriptLines[:available]
		}
		if rolling == "" {
			return strings.TrimSpace(scriptLines)
		}
		return strings.TrimSpace(rolling) + " " + strings.TrimSpace(scriptLines)
	}

	for {
		select {
		case data := <-msgs:
			if len(initSegment) == 0 {
				combined := append(append([]byte{}, buf...), data...)
				if init := extractInitSegment(combined, audioFormat); len(init) > 0 {
					initSegment = init
				}
			}
			buf = append(buf, data...)
		case <-ticker.C:
			chunk := make([]byte, len(buf))
			copy(chunk, buf)
			buf = buf[:0]
			init := append([]byte{}, initSegment...)
			go flush(chunk, init, buildPrompt())
		case <-flushNow:
			chunk := make([]byte, len(buf))
			copy(chunk, buf)
			buf = buf[:0]
			init := append([]byte{}, initSegment...)
			go flush(chunk, init, buildPrompt())
		case <-done:
			flush(buf, initSegment, buildPrompt())
			return
		}
	}
}

func writeJSON(conn *websocket.Conn, writeMu *sync.Mutex, value any) {
	msg, err := json.Marshal(value)
	if err != nil {
		return
	}
	writeMessage(conn, writeMu, msg)
}

func writeMessage(conn *websocket.Conn, writeMu *sync.Mutex, msg []byte) {
	writeMu.Lock()
	defer writeMu.Unlock()
	if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
		log.Printf("audio ws write: %v", err)
	}
}

func audioFormatFromRequest(r *http.Request) string {
	if format := normalizeAudioFormat(r.URL.Query().Get("format")); format != "" {
		return format
	}
	if format := audioFormatFromMime(r.URL.Query().Get("mime")); format != "" {
		return format
	}
	return "webm"
}

func normalizeAudioFormat(format string) string {
	format = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(format)), ".")
	switch format {
	case "flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "ogg", "wav", "webm":
		return format
	default:
		return ""
	}
}

func audioFormatFromMime(mimeType string) string {
	mediaType := strings.ToLower(strings.TrimSpace(mimeType))
	if idx := strings.Index(mediaType, ";"); idx >= 0 {
		mediaType = strings.TrimSpace(mediaType[:idx])
	}

	switch mediaType {
	case "audio/webm", "video/webm":
		return "webm"
	case "audio/mp4", "video/mp4":
		return "mp4"
	case "audio/x-m4a":
		return "m4a"
	case "audio/mpeg", "audio/mp3":
		return "mp3"
	case "audio/mpga":
		return "mpga"
	case "audio/ogg", "application/ogg":
		return "ogg"
	case "audio/wav", "audio/wave", "audio/x-wav":
		return "wav"
	case "audio/flac", "audio/x-flac":
		return "flac"
	default:
		return ""
	}
}

func startsWithContainerHeader(data []byte, format string) bool {
	switch format {
	case "webm":
		return startsWithWebMHeader(data)
	case "m4a", "mp4":
		return startsWithMP4Header(data)
	default:
		return false
	}
}

func extractInitSegment(data []byte, format string) []byte {
	switch format {
	case "webm":
		return extractWebMInitSegment(data)
	case "m4a", "mp4":
		return extractMP4InitSegment(data)
	default:
		return nil
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

func startsWithMP4Header(data []byte) bool {
	return len(data) >= 8 && string(data[4:8]) == "ftyp"
}

func extractMP4InitSegment(data []byte) []byte {
	if !startsWithMP4Header(data) {
		return nil
	}
	idx := bytes.Index(data, []byte("moof"))
	if idx <= 4 {
		return nil
	}
	init := make([]byte, idx-4)
	copy(init, data[:idx-4])
	return init
}
