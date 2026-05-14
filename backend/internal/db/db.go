package db

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS scripts (
	id         TEXT PRIMARY KEY,
	title      TEXT NOT NULL,
	raw_md     TEXT NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
	join_code  TEXT PRIMARY KEY,
	script_id  TEXT NOT NULL,
	language   TEXT NOT NULL DEFAULT '',
	cursor     INTEGER NOT NULL DEFAULT 0,
	paused     INTEGER NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS annotations (
	id         INTEGER  PRIMARY KEY AUTOINCREMENT,
	script_id  TEXT     NOT NULL,
	line_index INTEGER  NOT NULL,
	type       TEXT     NOT NULL,
	content    TEXT     NOT NULL DEFAULT '',
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ann_script ON annotations(script_id);
CREATE INDEX IF NOT EXISTS idx_ann_line   ON annotations(script_id, line_index);
CREATE TABLE IF NOT EXISTS operators (
	id            TEXT PRIMARY KEY,
	username      TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`

// Open opens (or creates) a SQLite database at dsn, applies the shared schema,
// and returns the connection. The caller owns the *sql.DB and must close it.
func Open(dsn string) (*sql.DB, error) {
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	if _, err := conn.Exec(schema); err != nil {
		conn.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	log.Printf("db: %s", dsn)
	return conn, nil
}
