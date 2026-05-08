package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"github.com/ziegenbeinmarius/theatrico/internal/script"
	"github.com/ziegenbeinmarius/theatrico/internal/session"
	ws "github.com/ziegenbeinmarius/theatrico/internal/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type server struct {
	sessions *session.Store
	hub      *ws.Hub
	host     string
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
		scriptPath = "scripts/example.md"
	}

	scr, err := script.ParseFile(scriptPath)
	if err != nil {
		log.Fatalf("parse script: %v", err)
	}

	srv := &server{
		sessions: session.NewStore(scr),
		hub:      ws.NewHub(),
		host:     host,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/sessions", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			log.Printf("%s %s: method not allowed", r.Method, r.URL.Path)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		srv.handleCreateSession(w, r)
	})
	mux.HandleFunc("/api/sessions/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/sessions/")
		parts := strings.SplitN(path, "/", 2)
		code := parts[0]
		if len(parts) == 2 && parts[1] == "ws" {
			srv.handleWebSocket(w, r, code)
			return
		}
		if r.Method == http.MethodGet {
			srv.handleGetSession(w, r, code)
			return
		}
		log.Printf("%s %s: not found", r.Method, r.URL.Path)
		http.Error(w, "not found", http.StatusNotFound)
	})

	// Serve frontend static files
	mux.Handle("/", http.FileServer(http.Dir("../frontend/dist")))

	log.Printf("listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
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
	sess, ok := s.sessions.Get(strings.ToUpper(code))
	if !ok {
		log.Printf("%s %s: session not found join_code=%s", r.Method, r.URL.Path, strings.ToUpper(code))
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
	sess, ok := s.sessions.Get(strings.ToUpper(code))
	if !ok {
		log.Printf("%s %s: websocket session not found join_code=%s", r.Method, r.URL.Path, strings.ToUpper(code))
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
