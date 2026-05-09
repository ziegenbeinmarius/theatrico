package recognizer

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTranscribeSuppressesNoSpeechSegment(t *testing.T) {
	rec := recognizerForResponse(t, transcriptionResponse{
		Text: "Thank you.",
		Segments: []transcriptionSegment{
			{
				Text:             " Thank you.",
				AvgLogprob:       -0.25,
				CompressionRatio: 1.1,
				NoSpeechProb:     0.82,
			},
		},
	})

	text, err := rec.Transcribe([]byte("audio"), "webm", "en")
	if err != nil {
		t.Fatalf("Transcribe returned error: %v", err)
	}
	if text != "" {
		t.Fatalf("expected silence transcript to be suppressed, got %q", text)
	}
}

func TestTranscribeSuppressesUncertainCommonSilenceHallucination(t *testing.T) {
	rec := recognizerForResponse(t, transcriptionResponse{
		Text: "you",
		Segments: []transcriptionSegment{
			{
				Text:             " you",
				AvgLogprob:       -0.3,
				CompressionRatio: 1.1,
				NoSpeechProb:     0.45,
			},
		},
	})

	text, err := rec.Transcribe([]byte("audio"), "webm", "en")
	if err != nil {
		t.Fatalf("Transcribe returned error: %v", err)
	}
	if text != "" {
		t.Fatalf("expected common silence hallucination to be suppressed, got %q", text)
	}
}

func TestTranscribeKeepsConfidentSpeech(t *testing.T) {
	rec := recognizerForResponse(t, transcriptionResponse{
		Text: " What light through yonder window breaks ",
		Segments: []transcriptionSegment{
			{
				Text:             " What light through yonder window breaks",
				AvgLogprob:       -0.2,
				CompressionRatio: 1.2,
				NoSpeechProb:     0.02,
			},
		},
	})

	text, err := rec.Transcribe([]byte("audio"), "webm", "en")
	if err != nil {
		t.Fatalf("Transcribe returned error: %v", err)
	}
	if text != "What light through yonder window breaks" {
		t.Fatalf("expected trimmed confident speech, got %q", text)
	}
}

func TestTranscribeRequestsVerboseJSON(t *testing.T) {
	var checked bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("ParseMultipartForm failed: %v", err)
		}
		if got := r.FormValue("response_format"); got != "verbose_json" {
			t.Fatalf("response_format = %q, want verbose_json", got)
		}
		if got := r.FormValue("temperature"); got != "0" {
			t.Fatalf("temperature = %q, want 0", got)
		}
		if got := r.FormValue("language"); got != "en" {
			t.Fatalf("language = %q, want en", got)
		}
		checked = true
		writeTranscriptionResponse(t, w, transcriptionResponse{Text: "hello"})
	}))
	defer server.Close()

	rec := New("test-key")
	rec.endpoint = server.URL

	if _, err := rec.Transcribe([]byte("audio"), "webm", "en"); err != nil {
		t.Fatalf("Transcribe returned error: %v", err)
	}
	if !checked {
		t.Fatal("test server did not inspect the transcription request")
	}
}

func recognizerForResponse(t *testing.T, response transcriptionResponse) *Recognizer {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeTranscriptionResponse(t, w, response)
	}))
	t.Cleanup(server.Close)

	rec := New("test-key")
	rec.endpoint = server.URL
	return rec
}

func writeTranscriptionResponse(t *testing.T, w http.ResponseWriter, response transcriptionResponse) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		t.Fatalf("encode response: %v", err)
	}
}
