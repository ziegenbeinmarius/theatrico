package recognizer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

const defaultWhisperCppAddr = "http://localhost:8090"

type whisperCppServer struct {
	addr   string
	client *http.Client
}

// NewWhisperCpp returns a Recognizer that transcribes via a local whisper.cpp server.
// addr is the base URL of the server (e.g. "http://localhost:8090").
// If addr is empty, defaults to "http://localhost:8090".
//
// The server must expose POST /inference accepting multipart form data with
// a "file" field and optional "language", "prompt", and "response_format" fields.
// This matches the default whisper.cpp server (https://github.com/ggml-org/whisper.cpp).
func NewWhisperCpp(addr string) Recognizer {
	if addr == "" {
		addr = defaultWhisperCppAddr
	}
	return &whisperCppServer{
		addr:   strings.TrimRight(addr, "/"),
		client: &http.Client{Timeout: 60 * time.Second},
	}
}

func (w *whisperCppServer) Transcribe(audio []byte, format, language, prompt string) (string, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	fw, err := mw.CreateFormFile("file", "audio."+format)
	if err != nil {
		return "", fmt.Errorf("create form file: %w", err)
	}
	if _, err := fw.Write(audio); err != nil {
		return "", fmt.Errorf("write audio: %w", err)
	}
	if err := mw.WriteField("response_format", "verbose_json"); err != nil {
		return "", fmt.Errorf("write response_format: %w", err)
	}
	if err := mw.WriteField("temperature", "0"); err != nil {
		return "", fmt.Errorf("write temperature: %w", err)
	}
	if language != "" {
		if err := mw.WriteField("language", language); err != nil {
			return "", fmt.Errorf("write language: %w", err)
		}
	}
	if prompt != "" {
		if err := mw.WriteField("prompt", prompt); err != nil {
			return "", fmt.Errorf("write prompt: %w", err)
		}
	}
	mw.Close()

	req, err := http.NewRequest(http.MethodPost, w.addr+"/inference", &buf)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())

	resp, err := w.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("whisper.cpp server %d: %s", resp.StatusCode, body)
		return "", fmt.Errorf("whisper.cpp server status %d", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("whisper.cpp server status %d: %s", resp.StatusCode, string(body))
	}

	var result transcriptionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	if shouldSuppressTranscript(result) {
		return "", nil
	}
	return strings.TrimSpace(result.Text), nil
}
