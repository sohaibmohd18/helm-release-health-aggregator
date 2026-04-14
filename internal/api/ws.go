package api

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"

	v1alpha1 "github.com/sohaibmohmd18/helmsightss/pkg/apis/v1alpha1"
)

var upgrader = websocket.Upgrader{
	CheckOrigin:     func(_ *http.Request) bool { return true },
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
}

// Hub manages the set of active WebSocket clients and broadcasts events.
type Hub struct {
	mu      sync.RWMutex
	clients map[*wsClient]struct{}
	log     *zap.Logger
}

// NewHub creates and returns a Hub with an empty client set.
func NewHub(log *zap.Logger) *Hub {
	return &Hub{
		clients: make(map[*wsClient]struct{}),
		log:     log,
	}
}

// Broadcast serialises event e and sends it to every connected client.
func (h *Hub) Broadcast(e v1alpha1.HelmEvent) {
	msg, err := json.Marshal(e)
	if err != nil {
		h.log.Error("marshal event", zap.Error(err))
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		select {
		case c.send <- msg:
		default:
			// slow client — drop rather than block
		}
	}
}

// ServeWS upgrades the HTTP connection to a WebSocket and registers the client.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.log.Warn("ws upgrade", zap.Error(err))
		return
	}
	c := &wsClient{hub: h, conn: conn, send: make(chan []byte, 256)}
	h.register(c)
	go c.writePump()
	go c.readPump()
}

func (h *Hub) register(c *wsClient) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	h.log.Debug("ws client connected", zap.Int("total", len(h.clients)))
}

func (h *Hub) unregister(c *wsClient) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
	close(c.send)
	h.log.Debug("ws client disconnected", zap.Int("total", len(h.clients)))
}

// ---------------------------------------------------------------------------
// wsClient — per-connection goroutines
// ---------------------------------------------------------------------------

type wsClient struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 54 * time.Second
	maxMsgSize = 512
)

func (c *wsClient) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *wsClient) readPump() {
	defer func() {
		c.hub.unregister(c)
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMsgSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			break
		}
	}
}
