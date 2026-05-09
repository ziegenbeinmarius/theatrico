package api

import (
	"time"

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
	JoinCode      string         `json:"join_code"`
	Script        *script.Script `json:"script"`
	Cursor        int            `json:"cursor"`
	Paused        bool           `json:"paused"`
	Clients       int            `json:"clients"`
	ChunkDuration int            `json:"chunk_duration_ms"`
	Language      string         `json:"language"`
}

type PlayDetailResponse struct {
	ID     string         `json:"id"`
	Title  string         `json:"title"`
	Script *script.Script `json:"script"`
}

type PositionUpdate struct {
	Type      string    `json:"type"`
	Act       int       `json:"act"`
	Scene     int       `json:"scene"`
	Line      int       `json:"line"`
	Timestamp time.Time `json:"timestamp"`
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
