package script

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseFileExtractsActsScenesAndContinuationLines(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "script.md")
	source := `# Act 1

## Scene 1: Opening

**ROMEO:** First line.
Second line.

**JULIET:** Reply.

# Act 2

## Scene 1: Closing

**NURSE:** Done.
`

	if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
		t.Fatalf("write test script: %v", err)
	}

	got, err := ParseFile(path)
	if err != nil {
		t.Fatalf("ParseFile() error = %v", err)
	}

	if len(got.Acts) != 2 {
		t.Fatalf("len(Acts) = %d, want 2", len(got.Acts))
	}
	if got.Acts[0].Title != "Act 1" {
		t.Fatalf("first act title = %q, want Act 1", got.Acts[0].Title)
	}
	if got.Acts[0].Scenes[0].Title != "Scene 1: Opening" {
		t.Fatalf("first scene title = %q, want Scene 1: Opening", got.Acts[0].Scenes[0].Title)
	}

	lines := got.Acts[0].Scenes[0].Lines
	if len(lines) != 3 {
		t.Fatalf("len(lines) = %d, want 3", len(lines))
	}
	if lines[0].Character != "ROMEO" || lines[0].Text != "First line." {
		t.Fatalf("first line = %#v", lines[0])
	}
	if lines[1].Character != "ROMEO" || lines[1].Text != "Second line." {
		t.Fatalf("continuation line = %#v", lines[1])
	}
	if lines[2].Character != "JULIET" || lines[2].ID != 3 {
		t.Fatalf("third line = %#v", lines[2])
	}
}
