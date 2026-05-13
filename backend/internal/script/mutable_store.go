package script

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sort"
	"sync"
)

// MemoryStore is an in-memory Repository seeded from a directory of .md files.
// It supports runtime Add and Delete but does not persist changes across restarts.
// Use SQLiteStore to add persistence.
type MemoryStore struct {
	mu    sync.RWMutex
	plays map[string]*PlayEntry
	order []string
}

// NewMemoryStore loads scripts from dir and returns an in-memory-only store.
func NewMemoryStore(dir string) (*MemoryStore, error) {
	fs, err := NewFileStore(dir)
	if err != nil {
		return nil, err
	}
	ms := &MemoryStore{plays: make(map[string]*PlayEntry)}
	for _, p := range fs.List() {
		entry := p
		ms.plays[p.ID] = &entry
		ms.order = append(ms.order, p.ID)
	}
	sort.Strings(ms.order)
	return ms, nil
}

func (m *MemoryStore) List() []PlayEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]PlayEntry, 0, len(m.order))
	for _, id := range m.order {
		result = append(result, *m.plays[id])
	}
	return result
}

func (m *MemoryStore) Get(id string) (*PlayEntry, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	p, ok := m.plays[id]
	return p, ok
}

func (m *MemoryStore) Add(title, rawMD string) (string, error) {
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

func (m *MemoryStore) Delete(id string) bool {
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

func (m *MemoryStore) Len() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.plays)
}

func (m *MemoryStore) FirstID() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if len(m.order) == 0 {
		return ""
	}
	return m.order[0]
}

func (m *MemoryStore) IDs() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]string, len(m.order))
	copy(result, m.order)
	return result
}

// insert adds an entry directly without parsing — used by SQLiteStore during init.
func (m *MemoryStore) insert(entry *PlayEntry) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.plays[entry.ID]; exists {
		return
	}
	m.plays[entry.ID] = entry
	m.order = append(m.order, entry.ID)
	sort.Strings(m.order)
}

func validateScript(s *Script) error {
	if len(s.Acts) == 0 {
		return fmt.Errorf("no acts found; script must have at least one # Act heading")
	}
	hasScene, hasLine := false, false
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
