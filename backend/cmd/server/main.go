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
	"github.com/ziegenbeinmarius/theatrico/internal/annotation"
	"github.com/ziegenbeinmarius/theatrico/internal/api"
	"github.com/ziegenbeinmarius/theatrico/internal/audio"
	"github.com/ziegenbeinmarius/theatrico/internal/auth"
	"github.com/ziegenbeinmarius/theatrico/internal/db"
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
	scripts        script.Repository
	defaultPlayID  string
	sessions       session.Repository
	persistSession func(*session.Session)
	annotations    annotation.Store
	hub            *ws.Hub
	rec            recognizer.Recognizer
	host           string
	chunkDuration  time.Duration
	matchWindow    int
	matchThreshold float64
	matchMaxJump   int

	matchersMu sync.Mutex
	matchers   map[string]*matcher.Matcher // keyed by session ID
	auth       *auth.Store
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

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "theatrico.db"
	}
	conn, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET env var is required")
	}
	authStore := auth.NewStore(conn, jwtSecret)
	operatorUsername := os.Getenv("OPERATOR_USERNAME")
	if operatorUsername == "" {
		operatorUsername = "operator"
	}
	operatorPassword := os.Getenv("OPERATOR_PASSWORD")
	if operatorPassword == "" {
		log.Fatal("OPERATOR_PASSWORD env var is required")
	}
	if err := authStore.Seed(operatorUsername, operatorPassword); err != nil {
		log.Fatalf("seed operator: %v", err)
	}
	log.Printf("operator account ready: %s", operatorUsername)

	scripts, err := script.NewSQLiteStore(conn, scriptsDir)
	if err != nil {
		log.Fatalf("load scripts: %v", err)
	}
	if scripts.Len() == 0 {
		log.Fatalf("no script files found in %s", scriptsDir)
	}
	if _, ok := scripts.Get(defaultPlayID); !ok {
		defaultPlayID = scripts.FirstID()
		log.Printf("warning: default script %q not found, using %q", scriptPath, defaultPlayID)
	}
	log.Printf("loaded %d script(s): %s", scripts.Len(), strings.Join(scripts.IDs(), ", "))

	sessions, err := session.NewSQLiteStore(conn, scripts)
	if err != nil {
		log.Fatalf("init session store: %v", err)
	}

	srv := &server{
		scripts:        scripts,
		defaultPlayID:  defaultPlayID,
		sessions:       sessions,
		persistSession: sessions.Persist,
		annotations:    annotation.NewSQLiteStore(conn),
		hub:            ws.NewHub(),
		rec:            rec,
		host:           host,
		chunkDuration:  chunkDuration,
		matchWindow:    matchWindow,
		matchThreshold: matchThreshold,
		matchMaxJump:   matchMaxJump,
		matchers:       make(map[string]*matcher.Matcher),
		auth:           authStore,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/login", srv.handleLogin)
	mux.HandleFunc("/api/auth/logout", srv.auth.RequireAuth(srv.handleLogout))
	mux.HandleFunc("/api/scripts", srv.auth.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			srv.handleListScripts(w, r)
		case http.MethodPost:
			srv.handleUploadScript(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/scripts/", srv.auth.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/api/scripts/")
		if p == "" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		// /api/scripts/{id}/annotations
		if idx := strings.Index(p, "/"); idx != -1 {
			scriptID := p[:idx]
			sub := p[idx+1:]
			if sub == "annotations" {
				switch r.Method {
				case http.MethodGet:
					srv.handleListAnnotations(w, r, scriptID)
				case http.MethodPost:
					srv.handleCreateAnnotation(w, r, scriptID)
				default:
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				}
				return
			}
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		switch r.Method {
		case http.MethodGet:
			srv.handleGetScript(w, r, p)
		case http.MethodDelete:
			srv.handleDeleteScript(w, r, p)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/annotations/", srv.auth.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimPrefix(r.URL.Path, "/api/annotations/")
		if raw == "" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			http.Error(w, "invalid annotation id", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodPut:
			srv.handleUpdateAnnotation(w, r, id)
		case http.MethodDelete:
			srv.handleDeleteAnnotation(w, r, id)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	mux.HandleFunc("/api/sessions", srv.auth.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			srv.handleListSessions(w, r)
		case http.MethodPost:
			srv.handleCreateSession(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
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
				srv.auth.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
					srv.handleAudioWS(w, r, code)
				})(w, r)
				return
			case "operator":
				srv.auth.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
					srv.handleOperatorWS(w, r, code)
				})(w, r)
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
		} else if r.Method == http.MethodDelete {
			srv.auth.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				srv.handleDeleteSession(w, r, code)
			})(w, r)
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

func (s *server) handleListScripts(w http.ResponseWriter, r *http.Request) {
	plays := s.scripts.List()
	items := make([]api.PlayListItem, 0, len(plays))
	for _, p := range plays {
		items = append(items, api.PlayListItem{ID: p.ID, Title: p.Title})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items) //nolint:errcheck
}

func (s *server) handleGetScript(w http.ResponseWriter, r *http.Request, id string) {
	play, ok := s.scripts.Get(id)
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

	play, ok := s.scripts.Get(req.ScriptID)
	if !ok {
		play, _ = s.scripts.Get(s.defaultPlayID)
	}

	sess, err := s.sessions.Create(play.ID, req.Language, play.Script, play.FlatLines)
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
	var annots []annotation.Annotation
	if sess.ScriptID != "" {
		annots, _ = s.annotations.ListByScript(sess.ScriptID)
	}
	if annots == nil {
		annots = []annotation.Annotation{}
	}
	resp := api.SessionInfoResponse{
		JoinCode:      sess.JoinCode,
		ScriptID:      sess.ScriptID,
		Script:        sess.Script,
		Cursor:        sess.Cursor(),
		Paused:        sess.Paused(),
		Clients:       s.hub.ClientCount(sess.ID),
		ChunkDuration: int(s.chunkDuration.Milliseconds()),
		Language:      sess.Language,
		Annotations:   annots,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

// positionUpdate builds a PositionUpdate for seqIdx, including any cue annotations.
func (s *server) positionUpdate(sess *session.Session, seqIdx int) api.PositionUpdate {
	fl := sess.FlatLines[seqIdx]
	upd := api.PositionUpdate{
		Type:      "position_update",
		Act:       fl.ActIdx,
		Scene:     fl.SceneIdx,
		Line:      fl.ID,
		Timestamp: time.Now(),
	}
	if sess.ScriptID != "" {
		if cues, err := s.annotations.ListCuesForLine(sess.ScriptID, seqIdx); err == nil {
			for _, c := range cues {
				upd.Cues = append(upd.Cues, api.CueInfo{ID: c.ID, Content: c.Content})
			}
		}
	}
	return upd
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
		if init, merr := json.Marshal(s.positionUpdate(sess, cursor)); merr == nil {
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
			s.persistSession(sess)
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
			data, _ := json.Marshal(s.positionUpdate(sess, cursor))
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
				s.persistSession(sess)
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
			s.persistSession(sess)
			data, _ := json.Marshal(api.PausedMsg{Type: "paused", Paused: true})
			s.hub.Broadcast(sess.ID, data)
		case "resume":
			sess.SetPaused(false)
			s.persistSession(sess)
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
			s.persistSession(sess)
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

	id, err := s.scripts.Add(title, rawMD)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid script: %s", err), http.StatusBadRequest)
		return
	}

	entry, _ := s.scripts.Get(id)
	resp := api.PlayDetailResponse{ID: entry.ID, Title: entry.Title, Script: entry.Script}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

func (s *server) handleDeleteScript(w http.ResponseWriter, r *http.Request, id string) {
	if !s.scripts.Delete(id) {
		http.Error(w, "script not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token string `json:"token"`
}

func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" || req.Password == "" {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	token, err := s.auth.Login(req.Username, req.Password)
	if err != nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    token,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Path:     "/",
		MaxAge:   8 * 60 * 60,
	})
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(loginResponse{Token: token}) //nolint:errcheck
}

func (s *server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    "",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Path:     "/",
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}


func (s *server) handleListAnnotations(w http.ResponseWriter, r *http.Request, scriptID string) {
	if _, ok := s.scripts.Get(scriptID); !ok {
		http.Error(w, "script not found", http.StatusNotFound)
		return
	}
	annots, err := s.annotations.ListByScript(scriptID)
	if err != nil {
		log.Printf("list annotations: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if annots == nil {
		annots = []annotation.Annotation{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(annots) //nolint:errcheck
}

func (s *server) handleCreateAnnotation(w http.ResponseWriter, r *http.Request, scriptID string) {
	if _, ok := s.scripts.Get(scriptID); !ok {
		http.Error(w, "script not found", http.StatusNotFound)
		return
	}
	var req api.CreateAnnotationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if req.Type != "note" && req.Type != "cue" {
		http.Error(w, `type must be "note" or "cue"`, http.StatusBadRequest)
		return
	}
	a, err := s.annotations.Create(scriptID, req.LineIndex, req.Type, req.Content)
	if err != nil {
		log.Printf("create annotation: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(a) //nolint:errcheck
}

func (s *server) handleUpdateAnnotation(w http.ResponseWriter, r *http.Request, id int64) {
	var req api.UpdateAnnotationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if req.Type != "note" && req.Type != "cue" {
		http.Error(w, `type must be "note" or "cue"`, http.StatusBadRequest)
		return
	}
	a, err := s.annotations.Update(id, req.Type, req.Content)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "annotation not found", http.StatusNotFound)
			return
		}
		log.Printf("update annotation: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a) //nolint:errcheck
}

func (s *server) handleDeleteAnnotation(w http.ResponseWriter, r *http.Request, id int64) {
	if err := s.annotations.Delete(id); err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "annotation not found", http.StatusNotFound)
			return
		}
		log.Printf("delete annotation: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	sessions := s.sessions.List()
	items := make([]api.SessionListItem, 0, len(sessions))
	for _, sess := range sessions {
		title := ""
		if entry, ok := s.scripts.Get(sess.ScriptID); ok {
			title = entry.Title
		}
		items = append(items, api.SessionListItem{
			JoinCode:    sess.JoinCode,
			ScriptID:    sess.ScriptID,
			ScriptTitle: title,
			Cursor:      sess.Cursor(),
			Paused:      sess.Paused(),
			CreatedAt:   sess.CreatedAt.Format(time.RFC3339),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items) //nolint:errcheck
}

func (s *server) handleDeleteSession(w http.ResponseWriter, r *http.Request, code string) {
	if !s.sessions.Delete(code) {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	s.hub.CloseSession(code)
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
