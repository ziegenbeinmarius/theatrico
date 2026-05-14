package ws

import "sync"

type Hub struct {
	mu      sync.RWMutex
	clients map[string]map[*Client]struct{}
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[string]map[*Client]struct{}),
	}
}

func (h *Hub) Register(sessionID string, c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[sessionID] == nil {
		h.clients[sessionID] = make(map[*Client]struct{})
	}
	h.clients[sessionID][c] = struct{}{}
}

func (h *Hub) Unregister(sessionID string, c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set, ok := h.clients[sessionID]; ok {
		delete(set, c)
		if len(set) == 0 {
			delete(h.clients, sessionID)
		}
	}
}

// ClientCount returns the number of audience clients connected to a session.
func (h *Hub) ClientCount(sessionID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients[sessionID])
}

// CloseSession disconnects all clients connected to the given session.
func (h *Hub) CloseSession(sessionID string) {
	h.mu.Lock()
	clients := h.clients[sessionID]
	delete(h.clients, sessionID)
	h.mu.Unlock()

	for c := range clients {
		c.conn.Close()
	}
}

func (h *Hub) Broadcast(sessionID string, msg []byte) {
	h.mu.RLock()
	targets := make([]*Client, 0, len(h.clients[sessionID]))
	for c := range h.clients[sessionID] {
		targets = append(targets, c)
	}
	h.mu.RUnlock()

	for _, c := range targets {
		select {
		case c.send <- msg:
		default:
			// slow client: drop
		}
	}
}
