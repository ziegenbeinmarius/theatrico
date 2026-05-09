package audio

import (
	"net/http/httptest"
	"testing"
)

func TestAudioFormatFromRequest(t *testing.T) {
	tests := []struct {
		name string
		url  string
		want string
	}{
		{name: "defaults to webm", url: "/audio", want: "webm"},
		{name: "accepts explicit format", url: "/audio?format=.m4a", want: "m4a"},
		{name: "accepts webm mime", url: "/audio?mime=audio%2Fwebm%3Bcodecs%3Dopus", want: "webm"},
		{name: "accepts mp4 mime", url: "/audio?mime=audio%2Fmp4%3Bcodecs%3Dmp4a.40.2", want: "mp4"},
		{name: "accepts wav mime", url: "/audio?mime=audio%2Fx-wav", want: "wav"},
		{name: "ignores unsupported format", url: "/audio?format=exe&mime=audio%2Fmpeg", want: "mp3"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tt.url, nil)
			if got := audioFormatFromRequest(req); got != tt.want {
				t.Fatalf("audioFormatFromRequest() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestExtractMP4InitSegment(t *testing.T) {
	data := append([]byte{
		0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p',
		'i', 's', 'o', 'm', 0x00, 0x00, 0x02, 0x00,
		'i', 's', 'o', 'm', 'i', 's', 'o', '2',
		0x00, 0x00, 0x00, 0x08, 'm', 'o', 'o', 'f',
	}, []byte{0x00, 0x00, 0x00, 0x08, 'm', 'd', 'a', 't'}...)

	init := extractMP4InitSegment(data)
	if len(init) != 24 {
		t.Fatalf("len(init) = %d, want 24", len(init))
	}
	if !startsWithMP4Header(init) {
		t.Fatal("init segment should keep the MP4 ftyp header")
	}
}

func TestExtractWebMInitSegmentFromBufferedChunks(t *testing.T) {
	header := []byte{0x1A, 0x45, 0xDF, 0xA3, 0x42, 0x86}
	cluster := []byte{0x1F, 0x43, 0xB6, 0x75, 0x01, 0x02}
	buffered := append(append([]byte{}, header...), cluster...)

	init := extractInitSegment(buffered, "webm")
	if len(init) != len(header) {
		t.Fatalf("len(init) = %d, want %d", len(init), len(header))
	}
}
