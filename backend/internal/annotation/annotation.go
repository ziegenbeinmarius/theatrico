package annotation

import "time"

// Annotation represents a note or cue attached to a specific script line.
type Annotation struct {
	ID        int64     `json:"id"`
	ScriptID  string    `json:"script_id"`
	LineIndex int       `json:"line_index"`
	Type      string    `json:"type"`    // "note" or "cue"
	Content   string    `json:"content"` // free text for notes; JSON for cues: {"cue_type":"lighting","description":"..."}
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Store is the interface for annotation persistence.
type Store interface {
	ListByScript(scriptID string) ([]Annotation, error)
	Create(scriptID string, lineIndex int, annotType, content string) (*Annotation, error)
	Update(id int64, annotType, content string) (*Annotation, error)
	Delete(id int64) error
	ListCuesForLine(scriptID string, lineIndex int) ([]Annotation, error)
}
