package script

import (
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// PlayEntry holds a parsed script and its precomputed flat lines.
type PlayEntry struct {
	ID        string
	Title     string
	Script    *Script
	FlatLines []FlatLine
}

// ScriptStore is the interface for play/script storage.
type ScriptStore interface {
	List() []PlayEntry
	Get(id string) (*PlayEntry, bool)
}

// FileStore implements ScriptStore by loading scripts from a directory of .md files.
type FileStore struct {
	plays     map[string]*PlayEntry
	playOrder []string
}

var titleCommentRe = regexp.MustCompile(`<!--\s*title:\s*(.+?)\s*-->`)

// NewFileStore scans dir for .md files and parses each as a script.
func NewFileStore(dir string) (*FileStore, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	plays := make(map[string]*PlayEntry)
	var ids []string

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}

		id := strings.TrimSuffix(entry.Name(), ".md")
		filePath := filepath.Join(dir, entry.Name())

		scr, err := ParseFile(filePath)
		if err != nil {
			log.Printf("warning: skipping script %s: %v", entry.Name(), err)
			continue
		}

		title := fileNameToTitle(id)
		if data, readErr := os.ReadFile(filePath); readErr == nil {
			firstLine := strings.SplitN(string(data), "\n", 2)[0]
			if m := titleCommentRe.FindStringSubmatch(firstLine); m != nil {
				title = strings.TrimSpace(m[1])
			}
		}
		scr.Title = title

		flatLines := Flatten(scr)
		plays[id] = &PlayEntry{
			ID:        id,
			Title:     title,
			Script:    scr,
			FlatLines: flatLines,
		}
		ids = append(ids, id)
	}

	sort.Strings(ids)
	return &FileStore{plays: plays, playOrder: ids}, nil
}

func (f *FileStore) List() []PlayEntry {
	result := make([]PlayEntry, 0, len(f.playOrder))
	for _, id := range f.playOrder {
		result = append(result, *f.plays[id])
	}
	return result
}

func (f *FileStore) Get(id string) (*PlayEntry, bool) {
	p, ok := f.plays[id]
	return p, ok
}

// Len returns the number of plays loaded.
func (f *FileStore) Len() int {
	return len(f.plays)
}

// FirstID returns the first play ID in sorted order, or empty string if none.
func (f *FileStore) FirstID() string {
	if len(f.playOrder) == 0 {
		return ""
	}
	return f.playOrder[0]
}

// IDs returns all play IDs in sorted order.
func (f *FileStore) IDs() []string {
	return f.playOrder
}

func fileNameToTitle(name string) string {
	words := strings.Split(name, "-")
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}
