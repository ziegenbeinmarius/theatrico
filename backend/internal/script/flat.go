package script

// FlatLine is a flat representation of a script line with its structural position.
type FlatLine struct {
	SeqIdx   int    // 0-based position in the flat list (used as cursor position)
	ID       int    // Line.ID (1-based, matches the JSON "id" field)
	ActIdx   int    // 0-based act index
	SceneIdx int    // 0-based scene index
	Character string
	Text      string
}

// Flatten returns all lines in script order as a flat slice.
func Flatten(s *Script) []FlatLine {
	var result []FlatLine
	for ai, act := range s.Acts {
		for si, scene := range act.Scenes {
			for _, line := range scene.Lines {
				result = append(result, FlatLine{
					SeqIdx:    len(result),
					ID:        line.ID,
					ActIdx:    ai,
					SceneIdx:  si,
					Character: line.Character,
					Text:      line.Text,
				})
			}
		}
	}
	return result
}
