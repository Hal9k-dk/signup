// Package vmnetwork provides a restricted WISP v1 TCP gateway for v86.
// It never dials an outbound socket: 192.168.86.2:80 is a virtual HTTP service.
package vmnetwork

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"time"

	"github.com/coder/websocket"
)

const (
	window     = 16
	maxPacket  = 32 * 1024
	maxRequest = 32 * 1024
	maxStreams = 4
)

// NewHandler serves /vm/network/. Only GET /health and POST /api/signup are
// available inside the guest tunnel. Pass the same API handler used by the host.
func NewHandler(api http.Handler) http.Handler {
	slots := make(chan struct{}, 64)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			http.Error(w, "VM network busy", http.StatusServiceUnavailable)
			return
		}
		conn, err := websocket.Accept(w, r, nil) // Same-origin browser upgrades only.
		if err != nil {
			return
		}
		defer conn.CloseNow()
		conn.SetReadLimit(maxPacket + 5)
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
		defer cancel()
		s := &session{conn: conn, ctx: ctx, api: api, streams: make(map[uint32]*stream)}
		defer func() { cancel(); s.wg.Wait() }()
		credit := make([]byte, 4)
		binary.LittleEndian.PutUint32(credit, window)
		if s.send(3, 0, credit) != nil {
			return
		}
		for {
			kind, frame, err := conn.Read(ctx)
			if err != nil {
				return
			}
			if kind != websocket.MessageBinary || len(frame) < 5 {
				conn.Close(websocket.StatusPolicyViolation, "Invalid WISP frame")
				return
			}
			id := binary.LittleEndian.Uint32(frame[1:5])
			payload := frame[5:]
			switch frame[0] {
			case 1:
				if id == 0 || len(payload) < 4 || payload[0] != 1 {
					s.send(4, id, []byte{0x41})
					continue
				}
				if binary.LittleEndian.Uint16(payload[1:3]) != 80 || string(payload[3:]) != "192.168.86.2" {
					s.send(4, id, []byte{0x48})
					continue
				}
				s.mu.Lock()
				_, duplicate := s.streams[id]
				if duplicate || len(s.streams) >= maxStreams {
					s.mu.Unlock()
					s.send(4, id, []byte{0x49})
					continue
				}
				streamCtx, stop := context.WithTimeout(ctx, 30*time.Second)
				st := &stream{ctx: streamCtx, cancel: stop, packets: make(chan []byte, window)}
				s.streams[id] = st
				s.mu.Unlock()
				s.wg.Add(1)
				go func() { defer s.wg.Done(); s.serve(id, st) }()
			case 2:
				s.mu.Lock()
				st := s.streams[id]
				if st != nil {
					st.received += len(payload)
				}
				tooLarge := st != nil && st.received > maxRequest
				s.mu.Unlock()
				if st == nil {
					s.send(4, id, []byte{0x41})
					continue
				}
				if tooLarge {
					s.closeStream(id, st, 0x49)
					continue
				}
				select {
				case st.packets <- payload:
				default:
					s.closeStream(id, st, 0x49)
				}
			case 4:
				if len(payload) != 1 {
					return
				}
				s.mu.Lock()
				st := s.streams[id]
				s.mu.Unlock()
				if st != nil {
					s.closeStream(id, st, 2)
				}
			default:
				conn.Close(websocket.StatusPolicyViolation, "Unsupported WISP packet")
				return
			}
		}
	})
}

type session struct {
	conn    *websocket.Conn
	ctx     context.Context
	api     http.Handler
	mu      sync.Mutex
	writeMu sync.Mutex
	streams map[uint32]*stream
	wg      sync.WaitGroup
}
type stream struct {
	ctx      context.Context
	cancel   context.CancelFunc
	packets  chan []byte
	received int
}

func (s *session) send(kind byte, id uint32, payload []byte) error {
	frame := make([]byte, 5+len(payload))
	frame[0] = kind
	binary.LittleEndian.PutUint32(frame[1:5], id)
	copy(frame[5:], payload)
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()
	return s.conn.Write(ctx, websocket.MessageBinary, frame)
}
func (s *session) closeStream(id uint32, st *stream, reason byte) {
	s.mu.Lock()
	if s.streams[id] != st {
		s.mu.Unlock()
		return
	}
	delete(s.streams, id)
	st.cancel()
	s.mu.Unlock()
	s.send(4, id, []byte{reason})
}

// packetReader replenishes credit only after a full window has been consumed.
// Advertising a full window on every packet would overrun the FIFO.
type packetReader struct {
	s        *session
	st       *stream
	id       uint32
	pending  []byte
	consumed int
}

func (p *packetReader) Read(b []byte) (int, error) {
	for len(p.pending) == 0 {
		select {
		case <-p.st.ctx.Done():
			return 0, p.st.ctx.Err()
		case p.pending = <-p.st.packets:
			p.consumed++
			if p.consumed == window {
				credit := make([]byte, 4)
				binary.LittleEndian.PutUint32(credit, window)
				if err := p.s.send(3, p.id, credit); err != nil {
					return 0, err
				}
				p.consumed = 0
			}
		}
	}
	n := copy(b, p.pending)
	p.pending = p.pending[n:]
	return n, nil
}
func (s *session) serve(id uint32, st *stream) {
	defer s.closeStream(id, st, 2)
	reader := bufio.NewReader(&packetReader{s: s, st: st, id: id})
	req, err := http.ReadRequest(reader)
	if err != nil {
		return
	}
	defer req.Body.Close()
	// No proxy semantics, alternate hosts, upgrade, or arbitrary API routes.
	req = req.WithContext(st.ctx)
	rec := httptest.NewRecorder()
	if req.Host != "192.168.86.2" && req.Host != "192.168.86.2:80" {
		http.Error(rec, "Unknown virtual host", http.StatusBadRequest)
	} else if req.URL.Path == "/health" && req.Method == http.MethodGet && req.URL.RawQuery == "" {
		rec.Header().Set("Content-Type", "text/plain; charset=utf-8")
		rec.WriteString("HAL9K VM network ready\n")
	} else if req.URL.Path == "/api/signup" && req.Method == http.MethodPost && req.URL.RawQuery == "" && !req.URL.IsAbs() {
		s.api.ServeHTTP(rec, req)
	} else {
		http.NotFound(rec, req)
	}
	response := rec.Result()
	defer response.Body.Close()
	response.Close = true
	response.Header.Set("Cache-Control", "no-store")
	var out bytes.Buffer
	if err = response.Write(&out); err != nil {
		return
	}
	for out.Len() > 0 {
		chunk := make([]byte, min(out.Len(), maxPacket))
		io.ReadFull(&out, chunk)
		if s.send(2, id, chunk) != nil {
			return
		}
	}
}
