package session

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/ziegenbeinmarius/theatrico/internal/script"
)

const joinCodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const joinCodeLen = 6

type Session struct {
	ID        string
	JoinCode  string
	Script    *script.Script
	CreatedAt time.Time

	mu     sync.Mutex
	cursor int  // SeqIdx of current highlighted line
	paused bool // when true the auto-matcher is suspended
}

// Cursor returns the current cursor position (SeqIdx).
func (s *Session) Cursor() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cursor
}

// SetCursor updates the cursor position.
func (s *Session) SetCursor(seqIdx int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cursor = seqIdx
}

// Paused returns whether auto-matching is paused.
func (s *Session) Paused() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.paused
}

// SetPaused sets the paused flag.
func (s *Session) SetPaused(p bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.paused = p
}

type Store struct {
	mu            sync.RWMutex
	byCode        map[string]*Session
	defaultScript *script.Script
}

func NewStore(defaultScript *script.Script) *Store {
	return &Store{
		byCode:        make(map[string]*Session),
		defaultScript: defaultScript,
	}
}

func generateCode() (string, error) {
	b := make([]byte, joinCodeLen)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(joinCodeChars))))
		if err != nil {
			return "", err
		}
		b[i] = joinCodeChars[n.Int64()]
	}
	return string(b), nil
}

func (s *Store) Create() (*Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var code string
	for {
		var err error
		code, err = generateCode()
		if err != nil {
			return nil, fmt.Errorf("generate join code: %w", err)
		}
		if _, exists := s.byCode[code]; !exists {
			break
		}
	}

	sess := &Session{
		ID:        code,
		JoinCode:  code,
		Script:    s.defaultScript,
		CreatedAt: time.Now(),
	}
	s.byCode[code] = sess
	return sess, nil
}

func (s *Store) Get(code string) (*Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.byCode[code]
	return sess, ok
}
