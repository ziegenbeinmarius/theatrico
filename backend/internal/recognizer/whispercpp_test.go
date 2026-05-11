package recognizer

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWhisperCppTranscribe(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/inference" {
			t.Fatalf("unexpected path %q, want /inference", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method %q, want POST", r.Method)
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("ParseMultipartForm failed: %v", err)
		}
		if got := r.FormValue("response_format"); got != "verbose_json" {
			t.Fatalf("response_format = %q, want verbose_json", got)
		}
		if got := r.FormValue("language"); got != "de" {
			t.Fatalf("language = %q, want de", got)
		}
		// whisper.cpp does not require an Authorization header
		if auth := r.Header.Get("Authorization"); auth != "" {
			t.Fatalf("unexpected Authorization header: %q", auth)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(transcriptionResponse{ //nolint:errcheck
			Text: " Ein Test",
			Segments: []transcriptionSegment{
				{Text: " Ein Test", AvgLogprob: -0.1, CompressionRatio: 1.1, NoSpeechProb: 0.01},
			},
		})
	}))
	defer server.Close()

	rec := NewWhisperCpp(server.URL)
	text, err := rec.Transcribe([]byte("audio"), "wav", "de", "")
	if err != nil {
		t.Fatalf("Transcribe error: %v", err)
	}
	if text != "Ein Test" {
		t.Fatalf("got %q, want %q", text, "Ein Test")
	}
}

func TestWhisperCppSuppressesSilence(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(transcriptionResponse{ //nolint:errcheck
			Text: "Thank you.",
			Segments: []transcriptionSegment{
				{Text: " Thank you.", NoSpeechProb: 0.9, AvgLogprob: -0.3, CompressionRatio: 1.0},
			},
		})
	}))
	defer server.Close()

	rec := NewWhisperCpp(server.URL)
	text, err := rec.Transcribe([]byte("audio"), "wav", "", "")
	if err != nil {
		t.Fatalf("Transcribe error: %v", err)
	}
	if text != "" {
		t.Fatalf("expected silence to be suppressed, got %q", text)
	}
}

func TestWhisperCppDefaultAddr(t *testing.T) {
	rec := NewWhisperCpp("").(*whisperCppServer)
	if rec.addr != defaultWhisperCppAddr {
		t.Fatalf("addr = %q, want %q", rec.addr, defaultWhisperCppAddr)
	}
}
