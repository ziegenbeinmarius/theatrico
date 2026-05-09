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

const (
	transcriptionEndpoint      = "https://api.openai.com/v1/audio/transcriptions"
	noSpeechThreshold          = 0.6
	confidentNoSpeechThreshold = 0.35
	lowLogprobThreshold        = -1.0
	highCompressionThreshold   = 2.4
)

type Recognizer struct {
	apiKey   string
	client   *http.Client
	endpoint string
}

func New(apiKey string) *Recognizer {
	return &Recognizer{
		apiKey:   apiKey,
		client:   &http.Client{Timeout: 30 * time.Second},
		endpoint: transcriptionEndpoint,
	}
}

type transcriptionResponse struct {
	Text     string                 `json:"text"`
	Segments []transcriptionSegment `json:"segments"`
}

type transcriptionSegment struct {
	Text             string  `json:"text"`
	AvgLogprob       float64 `json:"avg_logprob"`
	CompressionRatio float64 `json:"compression_ratio"`
	NoSpeechProb     float64 `json:"no_speech_prob"`
}

type apiError struct {
	status int
}

func (e *apiError) Error() string {
	return fmt.Sprintf("whisper API status %d", e.status)
}

// Transcribe sends audio bytes to the Whisper API and returns transcript text.
// format should be the file extension, e.g. "webm" or "wav".
// language is an optional ISO-639-1 code (e.g. "de", "en"); empty means auto-detect.
// Retries up to 3 times on HTTP 429.
func (r *Recognizer) Transcribe(audio []byte, format string, language string) (string, error) {
	const maxRetries = 3
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		text, err := r.transcribeOnce(audio, format, language)
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

func (r *Recognizer) transcribeOnce(audio []byte, format string, language string) (string, error) {
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

func shouldSuppressTranscript(result transcriptionResponse) bool {
	text := strings.TrimSpace(result.Text)
	if text == "" {
		return true
	}
	if len(result.Segments) == 0 {
		return false
	}

	textSegments := 0
	silenceSegments := 0
	confidentSpeechSegments := 0
	for _, segment := range result.Segments {
		if strings.TrimSpace(segment.Text) == "" {
			continue
		}
		textSegments++
		if isNoSpeechSegment(segment) {
			silenceSegments++
			continue
		}
		if isConfidentSpeechSegment(segment) {
			confidentSpeechSegments++
		}
	}

	if textSegments > 0 && textSegments == silenceSegments {
		return true
	}
	if isCommonSilenceHallucination(text) && confidentSpeechSegments == 0 {
		return true
	}
	return false
}

func isNoSpeechSegment(segment transcriptionSegment) bool {
	if segment.NoSpeechProb >= noSpeechThreshold {
		return true
	}
	return segment.AvgLogprob <= lowLogprobThreshold && segment.CompressionRatio >= highCompressionThreshold
}

func isConfidentSpeechSegment(segment transcriptionSegment) bool {
	return segment.NoSpeechProb < confidentNoSpeechThreshold &&
		segment.AvgLogprob > lowLogprobThreshold &&
		(segment.CompressionRatio == 0 || segment.CompressionRatio <= highCompressionThreshold)
}

func isCommonSilenceHallucination(text string) bool {
	normalized := strings.ToLower(strings.Trim(text, " \t\r\n.!?,;:\"'()[]{}"))
	switch normalized {
	case "you", "thank you":
		return true
	default:
		return false
	}
}
