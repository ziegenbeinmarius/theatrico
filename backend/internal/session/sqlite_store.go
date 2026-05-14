package session

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/ziegenbeinmarius/theatrico/internal/script"
)

// ScriptLookup is the subset of script.MutableStore that SQLiteStore needs.
type ScriptLookup interface {
	Get(id string) (*script.PlayEntry, bool)
}

// SQLiteStore persists sessions to a SQLite database while keeping an
// in-memory cache for fast lookups.
type SQLiteStore struct {
	db      *sql.DB
	inner   *MemoryStore
	scripts ScriptLookup
}

func NewSQLiteStore(db *sql.DB, scripts ScriptLookup) (*SQLiteStore, error) {
	s := &SQLiteStore{
		db:      db,
		inner:   NewMemoryStore(),
		scripts: scripts,
	}
	if err := s.loadFromDB(); err != nil {
		return nil, fmt.Errorf("load sessions from db: %w", err)
	}
	return s, nil
}

func (s *SQLiteStore) loadFromDB() error {
	rows, err := s.db.Query(`
		SELECT join_code, script_id, language, cursor, paused, created_at
		FROM sessions ORDER BY created_at
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var joinCode, scriptID, language string
		var cursor, pausedInt int
		var createdAt string

		if err := rows.Scan(&joinCode, &scriptID, &language, &cursor, &pausedInt, &createdAt); err != nil {
			log.Printf("warning: scan session row: %v", err)
			continue
		}

		entry, ok := s.scripts.Get(scriptID)
		if !ok {
			log.Printf("warning: session %s references missing script %s, skipping", joinCode, scriptID)
			continue
		}

		t, _ := time.Parse("2006-01-02 15:04:05", createdAt)
		sess := &Session{
			ID:        joinCode,
			JoinCode:  joinCode,
			ScriptID:  scriptID,
			Script:    entry.Script,
			FlatLines: entry.FlatLines,
			Language:  language,
			CreatedAt: t,
			cursor:    cursor,
			paused:    pausedInt != 0,
		}

		s.inner.mu.Lock()
		s.inner.byCode[joinCode] = sess
		s.inner.mu.Unlock()
	}

	count := len(s.inner.byCode)
	if count > 0 {
		log.Printf("restored %d session(s) from db", count)
	}

	return rows.Err()
}

func (s *SQLiteStore) Create(scriptID, language string, scr *script.Script, flatLines []script.FlatLine) (*Session, error) {
	sess, err := s.inner.Create(scriptID, language, scr, flatLines)
	if err != nil {
		return nil, err
	}

	_, err = s.db.Exec(
		`INSERT INTO sessions (join_code, script_id, language, cursor, paused) VALUES (?, ?, ?, 0, 0)`,
		sess.JoinCode, scriptID, language,
	)
	if err != nil {
		return nil, fmt.Errorf("persist session: %w", err)
	}

	return sess, nil
}

func (s *SQLiteStore) Get(code string) (*Session, bool) {
	return s.inner.Get(code)
}

func (s *SQLiteStore) List() []*Session {
	return s.inner.List()
}

func (s *SQLiteStore) Delete(code string) bool {
	if !s.inner.Delete(code) {
		return false
	}
	if _, err := s.db.Exec(`DELETE FROM sessions WHERE join_code = ?`, code); err != nil {
		log.Printf("warning: delete session %s from db: %v", code, err)
	}
	return true
}

// Persist writes the current cursor and paused state of sess to SQLite.
func (s *SQLiteStore) Persist(sess *Session) {
	sess.mu.Lock()
	cursor := sess.cursor
	paused := sess.paused
	sess.mu.Unlock()

	if _, err := s.db.Exec(
		`UPDATE sessions SET cursor = ?, paused = ? WHERE join_code = ?`,
		cursor, paused, sess.JoinCode,
	); err != nil {
		log.Printf("warning: persist session %s: %v", sess.JoinCode, err)
	}
}
