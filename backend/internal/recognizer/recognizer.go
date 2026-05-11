package recognizer

import "strings"

const (
	noSpeechThreshold          = 0.6
	confidentNoSpeechThreshold = 0.35
	lowLogprobThreshold        = -1.0
	highCompressionThreshold   = 2.4
)

// Recognizer is the interface for any speech-to-text backend.
type Recognizer interface {
	// Transcribe converts audio bytes to text.
	// format is the file extension (e.g. "webm", "wav").
	// language is an optional ISO-639-1 code; empty means auto-detect.
	// prompt is optional prior transcript context for streaming continuity.
	Transcribe(audio []byte, format, language, prompt string) (string, error)
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
