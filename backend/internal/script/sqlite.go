package script

import (
	"database/sql"
	"fmt"
	"log"
)

// SQLiteStore wraps a MemoryStore and persists uploaded scripts to SQLite.
// Scripts seeded from .md files at startup are never written to the database.
type SQLiteStore struct {
	db    *sql.DB
	inner *MemoryStore
}

// NewSQLiteStore seeds from .md files in dir, loads any previously uploaded
// scripts from db, and returns a Repository that persists Add/Delete calls.
func NewSQLiteStore(db *sql.DB, dir string) (*SQLiteStore, error) {
	inner, err := NewMemoryStore(dir)
	if err != nil {
		return nil, err
	}
	s := &SQLiteStore{db: db, inner: inner}
	if err := s.loadUploaded(); err != nil {
		return nil, fmt.Errorf("load uploaded scripts: %w", err)
	}
	return s, nil
}

func (s *SQLiteStore) loadUploaded() error {
	rows, err := s.db.Query(`SELECT id, title, raw_md FROM scripts`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, title, rawMD string
		if err := rows.Scan(&id, &title, &rawMD); err != nil {
			log.Printf("warning: scan script row: %v", err)
			continue
		}
		scr, err := ParseString(rawMD)
		if err != nil {
			log.Printf("warning: skipping invalid script %s from db: %v", id, err)
			continue
		}
		scr.Title = title
		s.inner.insert(&PlayEntry{ID: id, Title: title, Script: scr, FlatLines: Flatten(scr)})
	}
	return rows.Err()
}

func (s *SQLiteStore) List() []PlayEntry                { return s.inner.List() }
func (s *SQLiteStore) Get(id string) (*PlayEntry, bool) { return s.inner.Get(id) }
func (s *SQLiteStore) Len() int                         { return s.inner.Len() }
func (s *SQLiteStore) FirstID() string                  { return s.inner.FirstID() }
func (s *SQLiteStore) IDs() []string                    { return s.inner.IDs() }

func (s *SQLiteStore) Add(title, rawMD string) (string, error) {
	id, err := s.inner.Add(title, rawMD)
	if err != nil {
		return "", err
	}
	entry, _ := s.inner.Get(id)
	if _, err := s.db.Exec(
		`INSERT INTO scripts (id, title, raw_md) VALUES (?, ?, ?)`,
		id, entry.Title, rawMD,
	); err != nil {
		s.inner.Delete(id) // roll back in-memory add
		return "", fmt.Errorf("persist script: %w", err)
	}
	return id, nil
}

func (s *SQLiteStore) Delete(id string) bool {
	if !s.inner.Delete(id) {
		return false
	}
	s.db.Exec(`DELETE FROM scripts WHERE id = ?`, id) //nolint:errcheck
	return true
}
