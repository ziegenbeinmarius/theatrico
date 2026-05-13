package main

import (
	"encoding/json"
	"fmt"
	"io"
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
	"github.com/ziegenbeinmarius/theatrico/internal/api"
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
	scriptStore   *script.MutableStore
	defaultPlayID string
	sessions      session.Repository
	hub           *ws.Hub
	rec           recognizer.Recognizer
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

	var rec recognizer.Recognizer
	if addr := os.Getenv("WHISPER_CPP_ADDR"); addr != "" {
		rec = recognizer.NewWhisperCpp(addr)
		log.Printf("using whisper.cpp backend at %s", addr)
	} else {
		apiKey := os.Getenv("OPENAI_API_KEY")
		if apiKey == "" {
			log.Printf("warning: OPENAI_API_KEY is not set; transcription will fail unless WHISPER_CPP_ADDR is configured")
		}
		rec = recognizer.New(apiKey)
	}

	scriptStore, err := script.NewMutableStore(scriptsDir)
	if err != nil {
		log.Fatalf("load plays: %v", err)
	}
	if scriptStore.Len() == 0 {
		log.Fatalf("no script files found in %s", scriptsDir)
	}
	if _, ok := scriptStore.Get(defaultPlayID); !ok {
		// Fall back to first play if default not found.
		defaultPlayID = scriptStore.FirstID()
		log.Printf("warning: default script %q not found, using %q", scriptPath, defaultPlayID)
	}

	log.Printf("loaded %d play(s): %s", scriptStore.Len(), strings.Join(scriptStore.IDs(), ", "))

	srv := &server{
		scriptStore:    scriptStore,
		defaultPlayID:  defaultPlayID,
		sessions:       session.NewMemoryStore(),
		hub:            ws.NewHub(),
		rec:            rec,
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
	mux.HandleFunc("/api/scripts", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			srv.handleListPlays(w, r)
		case http.MethodPost:
			srv.handleUploadScript(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/scripts/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/scripts/")
		if id == "" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		switch r.Method {
		case http.MethodGet:
			srv.handleGetPlay(w, r, id)
		case http.MethodDelete:
			srv.handleDeleteScript(w, r, id)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
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
		frontendDist = "../apps/web/dist"
	}
	mux.Handle("/", spaFileServer(frontendDist))

	log.Printf("listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

func (s *server) handleListPlays(w http.ResponseWriter, r *http.Request) {
	plays := s.scriptStore.List()
	items := make([]api.PlayListItem, 0, len(plays))
	for _, p := range plays {
		items = append(items, api.PlayListItem{ID: p.ID, Title: p.Title})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items) //nolint:errcheck
}

func (s *server) handleGetPlay(w http.ResponseWriter, r *http.Request, id string) {
	play, ok := s.scriptStore.Get(id)
	if !ok {
		http.Error(w, "play not found", http.StatusNotFound)
		return
	}
	resp := api.PlayDetailResponse{ID: play.ID, Title: play.Title, Script: play.Script}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

func (s *server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req api.CreateSessionRequest
	json.NewDecoder(r.Body).Decode(&req) //nolint:errcheck

	play, ok := s.scriptStore.Get(req.ScriptID)
	if !ok {
		play, _ = s.scriptStore.Get(s.defaultPlayID)
	}

	sess, err := s.sessions.Create(req.Language, play.Script, play.FlatLines)
	if err != nil {
		log.Printf("create session: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	// Pre-create the matcher so it's ready.
	s.sessionMatcher(sess)

	resp := api.CreateSessionResponse{
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
	resp := api.SessionInfoResponse{
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
		if init, merr := json.Marshal(api.PositionUpdate{
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
			update, _ := json.Marshal(api.PositionUpdate{
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
		status := api.StatusMsg{
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
			data, _ := json.Marshal(api.PositionUpdate{
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
		var msg api.OperatorMsg
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		switch msg.Type {
		case "force_position":
			if msg.Line >= 0 && msg.Line < len(sess.FlatLines) {
				m.ForcePosition(msg.Line)
				fl := sess.FlatLines[msg.Line]
				sess.SetCursor(msg.Line)
				update, _ := json.Marshal(api.PositionUpdate{
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
			data, _ := json.Marshal(api.PausedMsg{Type: "paused", Paused: true})
			s.hub.Broadcast(sess.ID, data)
		case "resume":
			sess.SetPaused(false)
			data, _ := json.Marshal(api.PausedMsg{Type: "paused", Paused: false})
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
	var req api.SimulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Text == "" {
		http.Error(w, `invalid body — expected {"text":"..."}`, http.StatusBadRequest)
		return
	}

	tmsg, _ := json.Marshal(api.TranscriptMsg{Type: "transcript", Text: req.Text})
	s.hub.Broadcast(sess.ID, tmsg)

	if !sess.Paused() {
		m := s.sessionMatcher(sess)
		if result := m.Match(req.Text); result != nil {
			sess.SetCursor(result.SeqIdx)
			update, _ := json.Marshal(api.PositionUpdate{
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

const maxUploadSize = 1 << 20 // 1 MB

func (s *server) handleUploadScript(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	var rawMD, title string
	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/form-data") {
		if err := r.ParseMultipartForm(maxUploadSize); err != nil {
			http.Error(w, "request too large or malformed", http.StatusBadRequest)
			return
		}
		title = r.FormValue("title")
		f, _, err := r.FormFile("script")
		if err != nil {
			http.Error(w, "missing 'script' file field in multipart form", http.StatusBadRequest)
			return
		}
		defer f.Close()
		data, err := io.ReadAll(f)
		if err != nil {
			http.Error(w, "could not read uploaded file", http.StatusBadRequest)
			return
		}
		rawMD = string(data)
	} else {
		data, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "could not read request body", http.StatusBadRequest)
			return
		}
		rawMD = string(data)
		title = r.URL.Query().Get("title")
	}

	if strings.TrimSpace(rawMD) == "" {
		http.Error(w, "script content is empty", http.StatusBadRequest)
		return
	}

	id, err := s.scriptStore.Add(title, rawMD)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid script: %s", err), http.StatusBadRequest)
		return
	}

	entry, _ := s.scriptStore.Get(id)
	resp := api.PlayDetailResponse{ID: entry.ID, Title: entry.Title, Script: entry.Script}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

func (s *server) handleDeleteScript(w http.ResponseWriter, r *http.Request, id string) {
	if !s.scriptStore.Delete(id) {
		http.Error(w, "script not found", http.StatusNotFound)
		return
	}
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
