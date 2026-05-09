package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
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

// playEntry holds a parsed script and its precomputed flat lines.
type playEntry struct {
	ID        string
	Title     string
	Script    *script.Script
	FlatLines []script.FlatLine
}

type server struct {
	plays         map[string]*playEntry // keyed by play ID (filename without .md)
	playOrder     []string              // IDs in sorted order for listing
	defaultPlayID string
	sessions      *session.Store
	hub           *ws.Hub
	rec           *recognizer.Recognizer
	host          string
	chunkDuration time.Duration
	matchWindow    int
	matchThreshold float64
	matchMaxJump   int

	matchersMu sync.Mutex
	matchers   map[string]*matcher.Matcher // keyed by session ID
}

// sessionMatcher returns the matcher for the session, creating it if needed.
func (s *server) sessionMatcher(sess *session.Session) *matcher.Matcher {
	s.matchersMu.Lock()
	defer s.matchersMu.Unlock()
	if m, ok := s.matchers[sess.ID]; ok {
		return m
	}
	m := matcher.New(sess.FlatLines)
	m.Configure(s.matchWindow, s.matchThreshold, s.matchMaxJump)
	s.matchers[sess.ID] = m
	return m
}

type createSessionRequest struct {
	Language string `json:"language"`
	ScriptID string `json:"script_id"`
}

type createSessionResponse struct {
	JoinCode    string `json:"join_code"`
	QRUrl       string `json:"qr_url"`
	Language    string `json:"language"`
	ScriptTitle string `json:"script_title"`
}

type playListItem struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type sessionInfoResponse struct {
	JoinCode      string         `json:"join_code"`
	Script        *script.Script `json:"script"`
	Cursor        int            `json:"cursor"`
	Paused        bool           `json:"paused"`
	Clients       int            `json:"clients"`
	ChunkDuration int            `json:"chunk_duration_ms"`
	Language      string         `json:"language"`
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

var titleCommentRe = regexp.MustCompile(`<!--\s*title:\s*(.+?)\s*-->`)

// loadPlays scans dir for .md files and parses each as a script.
func loadPlays(dir string) (map[string]*playEntry, []string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, nil, err
	}

	plays := make(map[string]*playEntry)
	var ids []string

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}

		id := strings.TrimSuffix(entry.Name(), ".md")
		filePath := filepath.Join(dir, entry.Name())

		scr, err := script.ParseFile(filePath)
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

		flatLines := script.Flatten(scr)
		plays[id] = &playEntry{
			ID:        id,
			Title:     title,
			Script:    scr,
			FlatLines: flatLines,
		}
		ids = append(ids, id)
	}

	sort.Strings(ids)
	return plays, ids, nil
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
	scriptsDir := filepath.Dir(scriptPath)
	defaultPlayID := strings.TrimSuffix(filepath.Base(scriptPath), ".md")

	chunkDuration := 2 * time.Second

	matchWindow := 0
	if s := os.Getenv("MATCH_WINDOW_SIZE"); s != "" {
		matchWindow, _ = strconv.Atoi(s)
	}
	matchThreshold := 0.0
	if s := os.Getenv("MATCH_CONFIDENCE_THRESHOLD"); s != "" {
		matchThreshold, _ = strconv.ParseFloat(s, 64)
	}
	matchMaxJump := 0
	if s := os.Getenv("MATCH_MAX_JUMP"); s != "" {
		matchMaxJump, _ = strconv.Atoi(s)
	}

	apiKey := os.Getenv("OPENAI_API_KEY")

	plays, playOrder, err := loadPlays(scriptsDir)
	if err != nil {
		log.Fatalf("load plays: %v", err)
	}
	if len(plays) == 0 {
		log.Fatalf("no script files found in %s", scriptsDir)
	}
	if _, ok := plays[defaultPlayID]; !ok {
		// Fall back to first play if default not found.
		defaultPlayID = playOrder[0]
		log.Printf("warning: default script %q not found, using %q", scriptPath, defaultPlayID)
	}

	log.Printf("loaded %d play(s): %s", len(plays), strings.Join(playOrder, ", "))

	srv := &server{
		plays:          plays,
		playOrder:      playOrder,
		defaultPlayID:  defaultPlayID,
		sessions:       session.NewStore(),
		hub:            ws.NewHub(),
		rec:            recognizer.New(apiKey),
		host:           host,
		chunkDuration:  chunkDuration,
		matchWindow:    matchWindow,
		matchThreshold: matchThreshold,
		matchMaxJump:   matchMaxJump,
		matchers:       make(map[string]*matcher.Matcher),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/plays", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		srv.handleListPlays(w, r)
	})
	mux.HandleFunc("/api/plays/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		id := strings.TrimPrefix(r.URL.Path, "/api/plays/")
		if id == "" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		srv.handleGetPlay(w, r, id)
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

func (s *server) handleListPlays(w http.ResponseWriter, r *http.Request) {
	items := make([]playListItem, 0, len(s.playOrder))
	for _, id := range s.playOrder {
		p := s.plays[id]
		items = append(items, playListItem{ID: p.ID, Title: p.Title})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items) //nolint:errcheck
}

type playDetailResponse struct {
	ID     string         `json:"id"`
	Title  string         `json:"title"`
	Script *script.Script `json:"script"`
}

func (s *server) handleGetPlay(w http.ResponseWriter, r *http.Request, id string) {
	play, ok := s.plays[id]
	if !ok {
		http.Error(w, "play not found", http.StatusNotFound)
		return
	}
	resp := playDetailResponse{ID: play.ID, Title: play.Title, Script: play.Script}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

func (s *server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req createSessionRequest
	if r.ContentLength > 0 {
		json.NewDecoder(r.Body).Decode(&req) //nolint:errcheck
	}

	play, ok := s.plays[req.ScriptID]
	if !ok {
		play = s.plays[s.defaultPlayID]
	}

	sess, err := s.sessions.Create(req.Language, play.Script, play.FlatLines)
	if err != nil {
		log.Printf("create session: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	// Pre-create the matcher so it's ready.
	s.sessionMatcher(sess)

	resp := createSessionResponse{
		JoinCode:    sess.JoinCode,
		QRUrl:       fmt.Sprintf("http://%s/join/%s", s.host, sess.JoinCode),
		Language:    sess.Language,
		ScriptTitle: play.Title,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
	log.Printf("session created join_code=%s language=%q script=%q", sess.JoinCode, sess.Language, play.ID)
}

func (s *server) handleGetSession(w http.ResponseWriter, r *http.Request, code string) {
	sess, ok := s.sessions.Get(code)
	if !ok {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	resp := sessionInfoResponse{
		JoinCode:      sess.JoinCode,
		Script:        sess.Script,
		Cursor:        sess.Cursor(),
		Paused:        sess.Paused(),
		Clients:       s.hub.ClientCount(sess.ID),
		ChunkDuration: int(s.chunkDuration.Milliseconds()),
		Language:      sess.Language,
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
	// Send current position before handing conn to the hub client so that
	// audience members who join mid-session immediately see the right line.
	if cursor := sess.Cursor(); cursor > 0 && cursor < len(sess.FlatLines) {
		fl := sess.FlatLines[cursor]
		if init, merr := json.Marshal(positionUpdate{
			Type:      "position_update",
			Act:       fl.ActIdx,
			Scene:     fl.SceneIdx,
			Line:      fl.ID,
			Timestamp: time.Now(),
		}); merr == nil {
			conn.WriteMessage(websocket.TextMessage, init) //nolint:errcheck
		}
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
	m := s.sessionMatcher(sess)
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
	scriptContext := func() string {
		return m.NextLines(3)
	}
	audio.HandleOperatorAudio(w, r, sess.ID, s.rec, s.hub, s.chunkDuration, sess.Language, scriptContext, onTranscript)
}

// handleOperatorWS handles the operator control websocket.
func (s *server) handleOperatorWS(w http.ResponseWriter, r *http.Request, code string) {
	sess, ok := s.sessions.Get(code)
	if !ok {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	m := s.sessionMatcher(sess)

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

	sendCurrentPosition := func() {
		cursor := sess.Cursor()
		if cursor > 0 && cursor < len(sess.FlatLines) {
			fl := sess.FlatLines[cursor]
			data, _ := json.Marshal(positionUpdate{
				Type:      "position_update",
				Act:       fl.ActIdx,
				Scene:     fl.SceneIdx,
				Line:      fl.ID,
				Timestamp: time.Now(),
			})
			conn.WriteMessage(websocket.TextMessage, data) //nolint:errcheck
		}
	}

	sendStatus()
	sendCurrentPosition()

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
			if msg.Line >= 0 && msg.Line < len(sess.FlatLines) {
				m.ForcePosition(msg.Line)
				fl := sess.FlatLines[msg.Line]
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

	tmsg, _ := json.Marshal(transcriptMsg{Type: "transcript", Text: req.Text})
	s.hub.Broadcast(sess.ID, tmsg)

	if !sess.Paused() {
		m := s.sessionMatcher(sess)
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
