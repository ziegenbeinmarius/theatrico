package matcher

import (
	"math"
	"regexp"
	"strings"
	"sync"

	"github.com/ziegenbeinmarius/theatrico/internal/script"
)

const (
	DefaultWindowSize = 15
	DefaultThreshold  = 0.35
)

var nonAlpha = regexp.MustCompile(`[^a-z0-9 ]+`)

// MatchResult is delivered whenever the cursor advances.
type MatchResult struct {
	SeqIdx   int
	ID       int
	ActIdx   int
	SceneIdx int
}

// Matcher maintains a cursor over a flat script and advances it via fuzzy matching.
type Matcher struct {
	mu         sync.Mutex
	lines      []script.FlatLine
	cursor     int // SeqIdx of current position
	windowSize int
	threshold  float64
}

func New(lines []script.FlatLine) *Matcher {
	return &Matcher{
		lines:      lines,
		windowSize: DefaultWindowSize,
		threshold:  DefaultThreshold,
	}
}

func (m *Matcher) Configure(windowSize int, threshold float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if windowSize > 0 {
		m.windowSize = windowSize
	}
	if threshold > 0 {
		m.threshold = threshold
	}
}

func (m *Matcher) GetCursor() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.cursor
}

// ForcePosition sets the cursor to the given SeqIdx unconditionally.
func (m *Matcher) ForcePosition(seqIdx int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if seqIdx >= 0 && seqIdx < len(m.lines) {
		m.cursor = seqIdx
	}
}

// Match runs the fuzzy matching algorithm against the transcript and returns a
// MatchResult if the cursor should advance, or nil if no confident match was found.
func (m *Matcher) Match(transcript string) *MatchResult {
	if transcript == "" || len(m.lines) == 0 {
		return nil
	}
	norm := normalize(transcript)

	m.mu.Lock()
	cursor := m.cursor
	windowSize := m.windowSize
	threshold := m.threshold
	lines := m.lines
	m.mu.Unlock()

	end := cursor + windowSize
	if end > len(lines) {
		end = len(lines)
	}

	bestScore := -1.0
	bestIdx := -1

	for i := cursor; i < end; i++ {
		score := trigramSimilarity(norm, normalize(lines[i].Text))
		if score > bestScore {
			bestScore = score
			bestIdx = i
		}
	}

	// Only advance — never go backwards. Also require the best match to be
	// strictly ahead of the current cursor (tie at cursor = no movement).
	if bestScore >= threshold && bestIdx > cursor {
		m.mu.Lock()
		m.cursor = bestIdx
		m.mu.Unlock()
		l := lines[bestIdx]
		return &MatchResult{
			SeqIdx:   l.SeqIdx,
			ID:       l.ID,
			ActIdx:   l.ActIdx,
			SceneIdx: l.SceneIdx,
		}
	}
	return nil
}

// --- text normalization & trigram similarity ---

func normalize(s string) string {
	s = strings.ToLower(s)
	s = nonAlpha.ReplaceAllString(s, " ")
	return strings.Join(strings.Fields(s), " ")
}

func trigramSimilarity(a, b string) float64 {
	if a == "" || b == "" {
		return 0
	}
	ta := trigrams(a)
	tb := trigrams(b)
	if len(ta) == 0 || len(tb) == 0 {
		return wordOverlap(a, b)
	}
	intersection := 0
	for k, ca := range ta {
		if cb := tb[k]; cb > 0 {
			intersection += int(math.Min(float64(ca), float64(cb)))
		}
	}
	return 2.0 * float64(intersection) / float64(len(ta)+len(tb))
}

func trigrams(s string) map[string]int {
	if len(s) < 3 {
		return nil
	}
	m := make(map[string]int)
	for i := 0; i <= len(s)-3; i++ {
		m[s[i:i+3]]++
	}
	return m
}

func wordOverlap(a, b string) float64 {
	wa := strings.Fields(a)
	wb := strings.Fields(b)
	if len(wa) == 0 || len(wb) == 0 {
		return 0
	}
	set := make(map[string]bool, len(wa))
	for _, w := range wa {
		set[w] = true
	}
	hits := 0
	for _, w := range wb {
		if set[w] {
			hits++
		}
	}
	return float64(hits) / float64(len(wb))
}
