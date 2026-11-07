package vmnetwork

import (
	"context"
	"encoding/binary"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func packet(kind byte, id uint32, payload []byte) []byte {
	b := make([]byte, 5+len(payload))
	b[0] = kind
	binary.LittleEndian.PutUint32(b[1:], id)
	copy(b[5:], payload)
	return b
}
func connectPayload(host string) []byte { return append([]byte{1, 80, 0}, []byte(host)...) }
func dial(t *testing.T, h http.Handler) (*websocket.Conn, context.Context) {
	t.Helper()
	srv := httptest.NewServer(NewHandler(h))
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.CloseNow() })
	_, b, err := conn.Read(ctx)
	if err != nil || len(b) != 9 || b[0] != 3 || binary.LittleEndian.Uint32(b[5:]) != window {
		t.Fatalf("initial credit: %x %v", b, err)
	}
	return conn, ctx
}
func write(t *testing.T, c *websocket.Conn, ctx context.Context, kind byte, id uint32, payload []byte) {
	t.Helper()
	if err := c.Write(ctx, websocket.MessageBinary, packet(kind, id, payload)); err != nil {
		t.Fatal(err)
	}
}
func readResponse(t *testing.T, c *websocket.Conn, ctx context.Context) (string, int) {
	t.Helper()
	var response strings.Builder
	credits := 0
	for {
		_, b, err := c.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		switch b[0] {
		case 2:
			response.Write(b[5:])
		case 3:
			credits++
		case 4:
			return response.String(), credits
		default:
			t.Fatalf("unexpected %x", b)
		}
	}
}
func TestHealthAndSignup(t *testing.T) {
	calls := 0
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/api/signup" || r.Method != "POST" {
			t.Error("wrong route")
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(422)
		w.Write([]byte(`{"fields":{"email":"Ugyldig"}}`))
	})
	c, ctx := dial(t, h)
	write(t, c, ctx, 1, 1, connectPayload("192.168.86.2"))
	write(t, c, ctx, 2, 1, []byte("GET /health HTTP/1.0\r\nHost: 192.168.86.2\r\n\r\n"))
	got, _ := readResponse(t, c, ctx)
	if !strings.Contains(got, "200 OK") || !strings.Contains(got, "HAL9K VM network ready") {
		t.Fatal(got)
	}
	write(t, c, ctx, 1, 2, connectPayload("192.168.86.2"))
	write(t, c, ctx, 2, 2, []byte("POST /api/signup HTTP/1.0\r\nHost: 192.168.86.2\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}"))
	got, _ = readResponse(t, c, ctx)
	if !strings.Contains(got, "422") || !strings.Contains(got, "Ugyldig") || calls != 1 {
		t.Fatal(got, calls)
	}
}
func TestBlockedDestinationAndRoute(t *testing.T) {
	c, ctx := dial(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("unexpected API call") }))
	write(t, c, ctx, 1, 1, connectPayload("127.0.0.1"))
	_, b, err := c.Read(ctx)
	if err != nil || b[0] != 4 || b[5] != 0x48 {
		t.Fatalf("%x %v", b, err)
	}
	write(t, c, ctx, 1, 2, connectPayload("192.168.86.2"))
	write(t, c, ctx, 2, 2, []byte("GET /api/secret HTTP/1.0\r\nHost: 192.168.86.2\r\n\r\n"))
	got, _ := readResponse(t, c, ctx)
	if !strings.Contains(got, "404") {
		t.Fatal(got)
	}
}
func TestFlowControlAndFragmentedRequest(t *testing.T) {
	c, ctx := dial(t, http.NotFoundHandler())
	write(t, c, ctx, 1, 1, connectPayload("192.168.86.2"))
	request := []byte("GET /health HTTP/1.0\r\nHost: 192.168.86.2\r\n\r\n")
	// A compliant client exhausts each advertised window before requesting more.
	for i, b := range request {
		write(t, c, ctx, 2, 1, []byte{b})
		if (i+1)%window == 0 {
			_, credit, err := c.Read(ctx)
			if err != nil || credit[0] != 3 || binary.LittleEndian.Uint32(credit[5:]) != window {
				t.Fatalf("%x %v", credit, err)
			}
		}
	}
	got, _ := readResponse(t, c, ctx)
	if !strings.Contains(got, "200 OK") {
		t.Fatal(got)
	}
}
func TestRejectCrossOrigin(t *testing.T) {
	srv := httptest.NewServer(NewHandler(http.NotFoundHandler()))
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, response, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"https://other.example"}}})
	if err == nil || response.StatusCode != 403 {
		t.Fatalf("%v %v", response, err)
	}
}
func TestRejectTextAndShortFrames(t *testing.T) {
	for _, kind := range []websocket.MessageType{websocket.MessageText, websocket.MessageBinary} {
		c, ctx := dial(t, http.NotFoundHandler())
		if err := c.Write(ctx, kind, []byte{1}); err != nil {
			t.Fatal(err)
		}
		if _, _, err := c.Read(ctx); err == nil {
			t.Fatal("malformed frame accepted")
		}
	}
}
