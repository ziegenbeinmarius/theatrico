package annotation

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// SQLiteStore implements Store using a SQLite database.
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore opens (or creates) a SQLite database at path and ensures the
// annotations table exists.
func NewSQLiteStore(path string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS annotations (
			id         INTEGER  PRIMARY KEY AUTOINCREMENT,
			script_id  TEXT     NOT NULL,
			line_index INTEGER  NOT NULL,
			type       TEXT     NOT NULL,
			content    TEXT     NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_ann_script   ON annotations(script_id);
		CREATE INDEX IF NOT EXISTS idx_ann_line      ON annotations(script_id, line_index);
	`); err != nil {
		return nil, fmt.Errorf("create annotations table: %w", err)
	}
	return &SQLiteStore{db: db}, nil
}

func (s *SQLiteStore) ListByScript(scriptID string) ([]Annotation, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, line_index, type, content, created_at, updated_at
		 FROM annotations WHERE script_id = ? ORDER BY line_index, id`,
		scriptID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAll(rows)
}

func (s *SQLiteStore) Create(scriptID string, lineIndex int, annotType, content string) (*Annotation, error) {
	now := time.Now().UTC()
	res, err := s.db.Exec(
		`INSERT INTO annotations (script_id, line_index, type, content, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		scriptID, lineIndex, annotType, content, now, now,
	)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return &Annotation{
		ID:        id,
		ScriptID:  scriptID,
		LineIndex: lineIndex,
		Type:      annotType,
		Content:   content,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (s *SQLiteStore) Update(id int64, annotType, content string) (*Annotation, error) {
	now := time.Now().UTC()
	res, err := s.db.Exec(
		`UPDATE annotations SET type = ?, content = ?, updated_at = ? WHERE id = ?`,
		annotType, content, now, id,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, fmt.Errorf("annotation %d not found", id)
	}
	var a Annotation
	row := s.db.QueryRow(
		`SELECT id, script_id, line_index, type, content, created_at, updated_at FROM annotations WHERE id = ?`, id,
	)
	if err := row.Scan(&a.ID, &a.ScriptID, &a.LineIndex, &a.Type, &a.Content, &a.CreatedAt, &a.UpdatedAt); err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *SQLiteStore) Delete(id int64) error {
	res, err := s.db.Exec(`DELETE FROM annotations WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("annotation %d not found", id)
	}
	return nil
}

func (s *SQLiteStore) ListCuesForLine(scriptID string, lineIndex int) ([]Annotation, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, line_index, type, content, created_at, updated_at
		 FROM annotations WHERE script_id = ? AND line_index = ? AND type = 'cue' ORDER BY id`,
		scriptID, lineIndex,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAll(rows)
}

func scanAll(rows *sql.Rows) ([]Annotation, error) {
	var result []Annotation
	for rows.Next() {
		var a Annotation
		if err := rows.Scan(&a.ID, &a.ScriptID, &a.LineIndex, &a.Type, &a.Content, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, a)
	}
	return result, rows.Err()
}
