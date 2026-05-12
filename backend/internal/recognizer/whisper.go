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
	"strings"
	"time"
)

const transcriptionEndpoint = "https://api.openai.com/v1/audio/transcriptions"

type openAIWhisper struct {
	apiKey   string
	client   *http.Client
	endpoint string
}

// New returns a Recognizer that transcribes via the OpenAI Whisper API.
// apiKey is the OpenAI API key.
func New(apiKey string) Recognizer {
	return &openAIWhisper{
		apiKey:   apiKey,
		client:   &http.Client{Timeout: 30 * time.Second},
		endpoint: transcriptionEndpoint,
	}
}

type apiError struct {
	status int
}

func (e *apiError) Error() string {
	return fmt.Sprintf("whisper API status %d", e.status)
}

func (r *openAIWhisper) Transcribe(audio []byte, format, language, prompt string) (string, error) {
	const maxRetries = 3
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		text, err := r.transcribeOnce(audio, format, language, prompt)
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

func (r *openAIWhisper) transcribeOnce(audio []byte, format, language, prompt string) (string, error) {
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
	if err := mw.WriteField("response_format", "verbose_json"); err != nil {
		return "", fmt.Errorf("write response_format field: %w", err)
	}
	if err := mw.WriteField("temperature", "0"); err != nil {
		return "", fmt.Errorf("write temperature field: %w", err)
	}
	if language != "" {
		if err := mw.WriteField("language", language); err != nil {
			return "", fmt.Errorf("write language field: %w", err)
		}
	}
	if prompt != "" {
		if err := mw.WriteField("prompt", prompt); err != nil {
			return "", fmt.Errorf("write prompt field: %w", err)
		}
	}
	mw.Close()

	req, err := http.NewRequest(http.MethodPost, r.endpoint, &buf)
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
	if shouldSuppressTranscript(result) {
		return "", nil
	}
	return strings.TrimSpace(result.Text), nil
}
