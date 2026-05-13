package api

import (
	"time"

	"github.com/ziegenbeinmarius/theatrico/internal/annotation"
	"github.com/ziegenbeinmarius/theatrico/internal/script"
)

type CreateSessionRequest struct {
	Language string `json:"language"`
	ScriptID string `json:"script_id"`
}

type CreateSessionResponse struct {
	JoinCode    string `json:"join_code"`
	QRUrl       string `json:"qr_url"`
	Language    string `json:"language"`
	ScriptTitle string `json:"script_title"`
}

type PlayListItem struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type SessionInfoResponse struct {
	JoinCode      string                  `json:"join_code"`
	Script        *script.Script          `json:"script"`
	Cursor        int                     `json:"cursor"`
	Paused        bool                    `json:"paused"`
	Clients       int                     `json:"clients"`
	ChunkDuration int                     `json:"chunk_duration_ms"`
	Language      string                  `json:"language"`
	Annotations   []annotation.Annotation `json:"annotations"`
}

type PlayDetailResponse struct {
	ID     string         `json:"id"`
	Title  string         `json:"title"`
	Script *script.Script `json:"script"`
}

// CueInfo is embedded in position_update messages when the line has cue annotations.
type CueInfo struct {
	ID      int64  `json:"id"`
	Content string `json:"content"`
}

type PositionUpdate struct {
	Type      string     `json:"type"`
	Act       int        `json:"act"`
	Scene     int        `json:"scene"`
	Line      int        `json:"line"`
	Timestamp time.Time  `json:"timestamp"`
	Cues      []CueInfo  `json:"cues,omitempty"`
}

type PausedMsg struct {
	Type   string `json:"type"`
	Paused bool   `json:"paused"`
}

type StatusMsg struct {
	Type    string `json:"type"`
	Cursor  int    `json:"cursor"`
	Paused  bool   `json:"paused"`
	Clients int    `json:"clients"`
}

type SimulateRequest struct {
	Text string `json:"text"`
}

type TranscriptMsg struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// OperatorMsg is received from the operator websocket client.
type OperatorMsg struct {
	Type string `json:"type"`
	Line int    `json:"line"` // used for force_position (SeqIdx)
}

type CreateAnnotationRequest struct {
	LineIndex int    `json:"line_index"`
	Type      string `json:"type"`
	Content   string `json:"content"`
}

type UpdateAnnotationRequest struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}
