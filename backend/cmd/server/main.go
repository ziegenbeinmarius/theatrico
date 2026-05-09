package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"github.com/ziegenbeinmarius/theatrico/internal/audio"
	"github.com/ziegenbeinmarius/theatrico/internal/matcher"
	"github.com/ziegenbeinmarius/theatrico/internal/recognizer"
	"github.com/ziegenbeinmarius/theatrico/internal/script"
	"github.com/ziegenbeinmarius/theatrico/internal/session"
	ws "github.com/ziegenbeinmarius/theatrico/internal/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type server struct {
	script        *script.Script
	flatLines     []script.FlatLine
	sessions      *session.Store
	hub           *ws.Hub
	rec           *recognizer.Recognizer
	host          string
	chunkDuration time.Duration
	matchWindow   int
	matchThreshold float64

	matchersMu sync.Mutex
	matchers   map[string]*matcher.Matcher // keyed by session ID
}

// sessionMatcher returns the matcher for the session, creating it if needed.
func (s *server) sessionMatcher(sessID string) *matcher.Matcher {
	s.matchersMu.Lock()
	defer s.matchersMu.Unlock()
	if m, ok := s.matchers[sessID]; ok {
		return m
	}
	m := matcher.New(s.flatLines)
	m.Configure(s.matchWindow, s.matchThreshold)
	s.matchers[sessID] = m
	return m
}

type createSessionResponse struct {
	JoinCode string `json:"join_code"`
	QRUrl    string `json:"qr_url"`
}

type sessionInfoResponse struct {
	JoinCode string         `json:"join_code"`
	Script   *script.Script `json:"script"`
	Cursor   int            `json:"cursor"`
	Paused   bool           `json:"paused"`
	Clients  int            `json:"clients"`
}

type positionUpdate struct {
	Type      string    `json:"type"`
	Act       int       `json:"act"`
	Scene     int       `json:"scene"`
	Line      int       `json:"line"`
	Timestamp time.Time `json:"timestamp"`
}

type pausedMsg struct {
	Type   string `json:"type"`
	Paused bool   `json:"paused"`
}

type statusMsg struct {
	Type    string `json:"type"`
	Cursor  int    `json:"cursor"`
	Paused  bool   `json:"paused"`
	Clients int    `json:"clients"`
}

type simulateRequest struct {
	Text string `json:"text"`
}

type transcriptMsg struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// operatorMsg is received from the operator websocket client.
type operatorMsg struct {
	Type string `json:"type"`
	Line int    `json:"line"` // used for force_position (SeqIdx)
}

func main() {
	for _, envPath := range []string{".env", "../../.env"} {
		err := godotenv.Overload(envPath)
		if err == nil {
			break
		}
		if !os.IsNotExist(err) {
			log.Printf("warning: could not load %s: %v", envPath, err)
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	host := os.Getenv("HOST")
	if host == "" {
		host = fmt.Sprintf("localhost:%s", port)
	}

	scriptPath := os.Getenv("SCRIPT_PATH")
	if scriptPath == "" {
		scriptPath = "scripts/default.md"
	}

	chunkDuration := 7 * time.Second
	if s := os.Getenv("WHISPER_CHUNK_DURATION"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			chunkDuration = time.Duration(n) * time.Second
		}
	}

	matchWindow := 0
	if s := os.Getenv("MATCH_WINDOW_SIZE"); s != "" {
		matchWindow, _ = strconv.Atoi(s)
	}
	matchThreshold := 0.0
	if s := os.Getenv("MATCH_CONFIDENCE_THRESHOLD"); s != "" {
		matchThreshold, _ = strconv.ParseFloat(s, 64)
	}

	apiKey := os.Getenv("OPENAI_API_KEY")

	scr, err := script.ParseFile(scriptPath)
	if err != nil {
		log.Fatalf("parse script: %v", err)
	}

	srv := &server{
		script:         scr,
		flatLines:      script.Flatten(scr),
		sessions:       session.NewStore(scr),
		hub:            ws.NewHub(),
		rec:            recognizer.New(apiKey),
		host:           host,
		chunkDuration:  chunkDuration,
		matchWindow:    matchWindow,
		matchThreshold: matchThreshold,
		matchers:       make(map[string]*matcher.Matcher),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/script", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		srv.handleGetScript(w, r)
	})
	mux.HandleFunc("/api/sessions", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		srv.handleCreateSession(w, r)
	})
	mux.HandleFunc("/api/sessions/", func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/api/sessions/")
		parts := strings.SplitN(p, "/", 2)
		code := strings.ToUpper(parts[0])

		if len(parts) == 2 {
			switch parts[1] {
			case "ws":
				srv.handleWebSocket(w, r, code)
				return
			case "audio":
				srv.handleAudioWS(w, r, code)
				return
			case "operator":
				srv.handleOperatorWS(w, r, code)
				return
			case "simulate":
				if r.Method == http.MethodPost {
					srv.handleSimulate(w, r, code)
					return
				}
			}
		} else if r.Method == http.MethodGet {
			srv.handleGetSession(w, r, code)
			return
		}
		http.Error(w, "not found", http.StatusNotFound)
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not found", http.StatusNotFound)
	})

	frontendDist := os.Getenv("FRONTEND_DIST")
	if frontendDist == "" {
		frontendDist = "../frontend/dist"
	}
	mux.Handle("/", spaFileServer(frontendDist))

	log.Printf("listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

func (s *server) handleGetScript(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s.script) //nolint:errcheck
}

func (s *server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	sess, err := s.sessions.Create()
	if err != nil {
		log.Printf("create session: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	// Pre-create the matcher so it's ready.
	s.sessionMatcher(sess.ID)

	resp := createSessionResponse{
		JoinCode: sess.JoinCode,
		QRUrl:    fmt.Sprintf("http://%s/join/%s", s.host, sess.JoinCode),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
	log.Printf("session created join_code=%s", sess.JoinCode)
}

func (s *server) handleGetSession(w http.ResponseWriter, r *http.Request, code string) {
	sess, ok := s.sessions.Get(code)
	if !ok {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	resp := sessionInfoResponse{
		JoinCode: sess.JoinCode,
		Script:   sess.Script,
		Cursor:   sess.Cursor(),
		Paused:   sess.Paused(),
		Clients:  s.hub.ClientCount(sess.ID),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

func (s *server) handleWebSocket(w http.ResponseWriter, r *http.Request, code string) {
	sess, ok := s.sessions.Get(code)
	if !ok {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}
	client := ws.NewClient(s.hub, sess.ID, conn)
	s.hub.Register(sess.ID, client)
	go client.Run()
}

func (s *server) handleAudioWS(w http.ResponseWriter, r *http.Request, code string) {
	sess, ok := s.sessions.Get(code)
	if !ok {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	m := s.sessionMatcher(sess.ID)
	onTranscript := func(text string) {
		if sess.Paused() {
			return
		}
		if result := m.Match(text); result != nil {
			sess.SetCursor(result.SeqIdx)
			update, _ := json.Marshal(positionUpdate{
				Type:      "position_update",
				Act:       result.ActIdx,
				Scene:     result.SceneIdx,
				Line:      result.ID,
				Timestamp: time.Now(),
			})
			s.hub.Broadcast(sess.ID, update)
		}
	}
	audio.HandleOperatorAudio(w, r, sess.ID, s.rec, s.hub, s.chunkDuration, onTranscript)
}

// handleOperatorWS handles the operator control websocket.
// It accepts force_position / pause / resume messages and sends back status updates.
func (s *server) handleOperatorWS(w http.ResponseWriter, r *http.Request, code string) {
	sess, ok := s.sessions.Get(code)
	if !ok {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	m := s.sessionMatcher(sess.ID)

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("operator ws upgrade: %v", err)
		return
	}
	defer conn.Close()

	sendStatus := func() {
		status := statusMsg{
			Type:    "status",
			Cursor:  sess.Cursor(),
			Paused:  sess.Paused(),
			Clients: s.hub.ClientCount(sess.ID),
		}
		data, _ := json.Marshal(status)
		conn.WriteMessage(websocket.TextMessage, data) //nolint:errcheck
	}

	// Send initial status on connect.
	sendStatus()

	conn.SetReadLimit(4096)
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var msg operatorMsg
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		switch msg.Type {
		case "force_position":
			if msg.Line >= 0 && msg.Line < len(s.flatLines) {
				m.ForcePosition(msg.Line)
				fl := s.flatLines[msg.Line]
				sess.SetCursor(msg.Line)
				update, _ := json.Marshal(positionUpdate{
					Type:      "position_update",
					Act:       fl.ActIdx,
					Scene:     fl.SceneIdx,
					Line:      fl.ID,
					Timestamp: time.Now(),
				})
				s.hub.Broadcast(sess.ID, update)
			}
		case "pause":
			sess.SetPaused(true)
			data, _ := json.Marshal(pausedMsg{Type: "paused", Paused: true})
			s.hub.Broadcast(sess.ID, data)
		case "resume":
			sess.SetPaused(false)
			data, _ := json.Marshal(pausedMsg{Type: "paused", Paused: false})
			s.hub.Broadcast(sess.ID, data)
		}
		sendStatus()
	}
}

// handleSimulate injects transcript text directly into the matcher (for testing).
func (s *server) handleSimulate(w http.ResponseWriter, r *http.Request, code string) {
	sess, ok := s.sessions.Get(code)
	if !ok {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	var req simulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Text == "" {
		http.Error(w, `invalid body — expected {"text":"..."}`, http.StatusBadRequest)
		return
	}

	// Echo transcript to all clients.
	tmsg, _ := json.Marshal(transcriptMsg{Type: "transcript", Text: req.Text})
	s.hub.Broadcast(sess.ID, tmsg)

	// Run matcher if not paused.
	if !sess.Paused() {
		m := s.sessionMatcher(sess.ID)
		if result := m.Match(req.Text); result != nil {
			sess.SetCursor(result.SeqIdx)
			update, _ := json.Marshal(positionUpdate{
				Type:      "position_update",
				Act:       result.ActIdx,
				Scene:     result.SceneIdx,
				Line:      result.ID,
				Timestamp: time.Now(),
			})
			s.hub.Broadcast(sess.ID, update)
			log.Printf("simulate: matched line id=%d act=%d scene=%d", result.ID, result.ActIdx, result.SceneIdx)
		}
	}

	log.Printf("simulate: text=%q join_code=%s", req.Text, code)
	w.WriteHeader(http.StatusNoContent)
}

func spaFileServer(distDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		cleanPath := path.Clean("/" + r.URL.Path)
		if cleanPath != "/" {
			filePath := filepath.Join(distDir, strings.TrimPrefix(cleanPath, "/"))
			if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
				http.ServeFile(w, r, filePath)
				return
			}
		}

		indexPath := filepath.Join(distDir, "index.html")
		if _, err := os.Stat(indexPath); err != nil {
			http.Error(w, "frontend build not found; run npm run build in frontend", http.StatusServiceUnavailable)
			return
		}
		http.ServeFile(w, r, indexPath)
	})
}
