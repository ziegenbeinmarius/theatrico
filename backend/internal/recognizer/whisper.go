package recognizer

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"time"
)

type Recognizer struct {
	apiKey string
	client *http.Client
}

func New(apiKey string) *Recognizer {
	return &Recognizer{
		apiKey: apiKey,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

type transcriptionResponse struct {
	Text string `json:"text"`
}

type apiError struct {
	status int
}

func (e *apiError) Error() string {
	return fmt.Sprintf("whisper API status %d", e.status)
}

// Transcribe sends audio bytes to the Whisper API and returns transcript text.
// format should be the file extension, e.g. "webm" or "wav".
// Retries up to 3 times on HTTP 429.
func (r *Recognizer) Transcribe(audio []byte, format string) (string, error) {
	const maxRetries = 3
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		text, err := r.transcribeOnce(audio, format)
		if err == nil {
			return text, nil
		}
		lastErr = err
		var ae *apiError
		if !errors.As(err, &ae) || ae.status != 429 {
			return "", err
		}
		time.Sleep(time.Duration(1<<attempt) * time.Second)
	}
	return "", lastErr
}

func (r *Recognizer) transcribeOnce(audio []byte, format string) (string, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	fw, err := mw.CreateFormFile("file", "audio."+format)
	if err != nil {
		return "", fmt.Errorf("create form file: %w", err)
	}
	if _, err := fw.Write(audio); err != nil {
		return "", fmt.Errorf("write audio: %w", err)
	}
	if err := mw.WriteField("model", "whisper-1"); err != nil {
		return "", fmt.Errorf("write model field: %w", err)
	}
	mw.Close()

	req, err := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/audio/transcriptions", &buf)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+r.apiKey)

	resp, err := r.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		return "", &apiError{status: 429}
	}
	if resp.StatusCode >= 500 {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("whisper API 5xx (%d): %s", resp.StatusCode, body)
		return "", &apiError{status: resp.StatusCode}
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("whisper API status %d: %s", resp.StatusCode, string(body))
	}

	var result transcriptionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	return result.Text, nil
}
