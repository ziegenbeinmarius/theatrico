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
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"github.com/ziegenbeinmarius/theatrico/internal/audio"
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
	sessions      *session.Store
	hub           *ws.Hub
	rec           *recognizer.Recognizer
	host          string
	chunkDuration time.Duration
}

type createSessionResponse struct {
	JoinCode string `json:"join_code"`
	QRUrl    string `json:"qr_url"`
}

type sessionInfoResponse struct {
	JoinCode string         `json:"join_code"`
	Script   *script.Script `json:"script"`
}

type positionUpdate struct {
	Type      string    `json:"type"`
	Act       int       `json:"act"`
	Scene     int       `json:"scene"`
	Line      int       `json:"line"`
	Timestamp time.Time `json:"timestamp"`
}

type simulateRequest struct {
	Text string `json:"text"`
}

type transcriptMsg struct {
	Type string `json:"type"`
	Text string `json:"text"`
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

	apiKey := os.Getenv("OPENAI_API_KEY")

	scr, err := script.ParseFile(scriptPath)
	if err != nil {
		log.Fatalf("parse script: %v", err)
	}

	srv := &server{
		script:        scr,
		sessions:      session.NewStore(scr),
		hub:           ws.NewHub(),
		rec:           recognizer.New(apiKey),
		host:          host,
		chunkDuration: chunkDuration,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/script", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			log.Printf("%s %s: method not allowed", r.Method, r.URL.Path)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		srv.handleGetScript(w, r)
	})
	mux.HandleFunc("/api/sessions", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			log.Printf("%s %s: method not allowed", r.Method, r.URL.Path)
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
		log.Printf("%s %s: not found", r.Method, r.URL.Path)
		http.Error(w, "not found", http.StatusNotFound)
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s: not found", r.Method, r.URL.Path)
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
	if err := json.NewEncoder(w).Encode(s.script); err != nil {
		log.Printf("%s %s: encode script response failed: %v", r.Method, r.URL.Path, err)
	}
}

func (s *server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	sess, err := s.sessions.Create()
	if err != nil {
		log.Printf("%s %s: create session failed: %v", r.Method, r.URL.Path, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	resp := createSessionResponse{
		JoinCode: sess.JoinCode,
		QRUrl:    fmt.Sprintf("http://%s/join/%s", s.host, sess.JoinCode),
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("%s %s: encode create session response failed: %v", r.Method, r.URL.Path, err)
	}
	log.Printf("%s %s: session created join_code=%s", r.Method, r.URL.Path, sess.JoinCode)
}

func (s *server) handleGetSession(w http.ResponseWriter, r *http.Request, code string) {
	sess, ok := s.sessions.Get(code)
	if !ok {
		log.Printf("%s %s: session not found join_code=%s", r.Method, r.URL.Path, code)
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	resp := sessionInfoResponse{
		JoinCode: sess.JoinCode,
		Script:   sess.Script,
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("%s %s: encode session response failed: %v", r.Method, r.URL.Path, err)
	}
}

func (s *server) handleWebSocket(w http.ResponseWriter, r *http.Request, code string) {
	sess, ok := s.sessions.Get(code)
	if !ok {
		log.Printf("%s %s: websocket session not found join_code=%s", r.Method, r.URL.Path, code)
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
		log.Printf("%s %s: audio ws session not found join_code=%s", r.Method, r.URL.Path, code)
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	audio.HandleOperatorAudio(w, r, sess.ID, s.rec, s.hub, s.chunkDuration)
}

func (s *server) handleSimulate(w http.ResponseWriter, r *http.Request, code string) {
	sess, ok := s.sessions.Get(code)
	if !ok {
		log.Printf("%s %s: simulate session not found join_code=%s", r.Method, r.URL.Path, code)
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	var req simulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Text == "" {
		http.Error(w, `invalid body — expected {"text":"..."}`, http.StatusBadRequest)
		return
	}
	msg, _ := json.Marshal(transcriptMsg{Type: "transcript", Text: req.Text})
	s.hub.Broadcast(sess.ID, msg)
	log.Printf("%s %s: simulated transcript join_code=%s text=%q", r.Method, r.URL.Path, code, req.Text)
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
