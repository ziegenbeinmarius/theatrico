package script

import (
	"bufio"
	"os"
	"regexp"
	"strings"
)

type Line struct {
	ID        int    `json:"id"`
	Character string `json:"character"`
	Text      string `json:"text"`
}

type Scene struct {
	Title string `json:"title"`
	Lines []Line `json:"lines"`
}

type Act struct {
	Title  string  `json:"title"`
	Scenes []Scene `json:"scenes"`
}

type Script struct {
	Title string `json:"title"`
	Acts  []Act  `json:"acts"`
}

var characterLineRe = regexp.MustCompile(`^\*\*([A-Z][A-Z\s']+):\*\*\s*(.*)$`)

func ParseFile(path string) (*Script, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	script := &Script{Title: "Script"}
	var currentAct *Act
	var currentScene *Scene
	var currentChar string
	lineID := 0

	addLine := func(char, text string) {
		if currentScene == nil {
			return
		}
		lineID++
		currentScene.Lines = append(currentScene.Lines, Line{ID: lineID, Character: char, Text: text})
	}

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		raw := scanner.Text()
		trimmed := strings.TrimSpace(raw)

		if strings.HasPrefix(trimmed, "# ") && !strings.HasPrefix(trimmed, "## ") {
			// New act
			currentChar = ""
			act := Act{Title: strings.TrimPrefix(trimmed, "# ")}
			script.Acts = append(script.Acts, act)
			currentAct = &script.Acts[len(script.Acts)-1]
			currentScene = nil
			continue
		}

		if strings.HasPrefix(trimmed, "## ") {
			// New scene
			currentChar = ""
			if currentAct == nil {
				act := Act{Title: "Act 1"}
				script.Acts = append(script.Acts, act)
				currentAct = &script.Acts[len(script.Acts)-1]
			}
			scene := Scene{Title: strings.TrimPrefix(trimmed, "## ")}
			currentAct.Scenes = append(currentAct.Scenes, scene)
			currentScene = &currentAct.Scenes[len(currentAct.Scenes)-1]
			continue
		}

		if m := characterLineRe.FindStringSubmatch(trimmed); m != nil {
			currentChar = m[1]
			if m[2] != "" {
				addLine(currentChar, m[2])
			}
			continue
		}

		// Continuation line
		if currentChar != "" && trimmed != "" {
			addLine(currentChar, trimmed)
			continue
		}

		// Blank line resets continuation
		if trimmed == "" {
			currentChar = ""
		}
	}

	return script, scanner.Err()
}
