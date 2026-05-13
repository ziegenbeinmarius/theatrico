package script

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sort"
	"sync"
)

// MutableStore is an in-memory ScriptStore that supports adding and deleting
// scripts at runtime. It is seeded from a directory of .md files at startup.
// Data is not persisted across restarts.
type MutableStore struct {
	mu    sync.RWMutex
	plays map[string]*PlayEntry
	order []string // sorted IDs for stable listing
}

// NewMutableStore loads scripts from dir (like FileStore) and returns a store
// that also accepts runtime additions and deletions.
func NewMutableStore(dir string) (*MutableStore, error) {
	fs, err := NewFileStore(dir)
	if err != nil {
		return nil, err
	}
	ms := &MutableStore{plays: make(map[string]*PlayEntry)}
	for _, p := range fs.List() {
		entry := p
		ms.plays[p.ID] = &entry
		ms.order = append(ms.order, p.ID)
	}
	sort.Strings(ms.order)
	return ms, nil
}

func (m *MutableStore) List() []PlayEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]PlayEntry, 0, len(m.order))
	for _, id := range m.order {
		result = append(result, *m.plays[id])
	}
	return result
}

func (m *MutableStore) Get(id string) (*PlayEntry, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	p, ok := m.plays[id]
	return p, ok
}

// Add parses rawMD, validates it, and stores it under a new random ID.
// Returns the new ID or an error if the content is invalid.
func (m *MutableStore) Add(title, rawMD string) (string, error) {
	scr, err := ParseString(rawMD)
	if err != nil {
		return "", err
	}
	if err := validateScript(scr); err != nil {
		return "", err
	}
	if title != "" {
		scr.Title = title
	} else if scr.Title == "Script" || scr.Title == "" {
		scr.Title = "Uploaded Script"
	}

	id := randomID()
	entry := &PlayEntry{ID: id, Title: scr.Title, Script: scr, FlatLines: Flatten(scr)}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.plays[id] = entry
	m.order = append(m.order, id)
	sort.Strings(m.order)
	return id, nil
}

// Delete removes a script by ID. Returns false if the ID was not found.
func (m *MutableStore) Delete(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.plays[id]; !ok {
		return false
	}
	delete(m.plays, id)
	for i, oid := range m.order {
		if oid == id {
			m.order = append(m.order[:i], m.order[i+1:]...)
			break
		}
	}
	return true
}

func (m *MutableStore) Len() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.plays)
}

func (m *MutableStore) FirstID() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if len(m.order) == 0 {
		return ""
	}
	return m.order[0]
}

func (m *MutableStore) IDs() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]string, len(m.order))
	copy(result, m.order)
	return result
}

func validateScript(s *Script) error {
	if len(s.Acts) == 0 {
		return fmt.Errorf("no acts found; script must have at least one # Act heading")
	}
	hasScene := false
	hasLine := false
	for _, act := range s.Acts {
		if len(act.Scenes) > 0 {
			hasScene = true
		}
		for _, scene := range act.Scenes {
			if len(scene.Lines) > 0 {
				hasLine = true
			}
		}
	}
	if !hasScene {
		return fmt.Errorf("no scenes found; script must have at least one ## Scene heading")
	}
	if !hasLine {
		return fmt.Errorf("no character lines found; lines must use the format **CHARACTER:** text")
	}
	return nil
}

func randomID() string {
	b := make([]byte, 8)
	rand.Read(b) //nolint:errcheck
	return hex.EncodeToString(b)
}
