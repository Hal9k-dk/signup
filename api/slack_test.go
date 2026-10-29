package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSlackDelivery(t *testing.T) {
	for _, status := range []int{200, 400, 429, 500} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.Method != "POST" || r.Header.Get("Content-Type") != "application/json" {
					t.Error("expected JSON POST")
				}
				var payload struct {
					Text   string `json:"text"`
					Mrkdwn bool   `json:"mrkdwn"`
					Parse  string `json:"parse"`
				}
				if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
					t.Error(err)
				}
				for _, value := range []string{"Ada Lovelace", "ada@example.com", "Testvej 42", "2200", "København N", "10-12-1990", "+45 12345678", "ordinary", "PROSA: 1234"} {
					if !strings.Contains(payload.Text, value) {
						t.Errorf("missing signup value %q", value)
					}
				}
				if payload.Mrkdwn || payload.Parse != "none" {
					t.Error("user input should not enable Slack formatting/mentions")
				}
				w.WriteHeader(status)
			}))
			defer server.Close()
			var logs bytes.Buffer
			handler := newHandler(slog.New(slog.NewJSONHandler(&logs, nil)), slackNotifier(server.URL, server.Client()))
			payload, _ := json.Marshal(validSignup())
			req := httptest.NewRequest("POST", "/api/signup", bytes.NewReader(payload))
			req.Header.Set("Content-Type", "application/json")
			res := httptest.NewRecorder()
			handler.ServeHTTP(res, req)
			want := 200
			if status != 200 {
				want = 502
			}
			if calls != 1 || res.Code != want || !strings.Contains(logs.String(), "signup received") {
				t.Fatalf("calls=%d status=%d logs=%s", calls, res.Code, logs.String())
			}
			if strings.Contains(logs.String(), server.URL) {
				t.Fatal("webhook URL leaked into logs")
			}
			// Invalid signups must never call Slack.
			req = httptest.NewRequest("POST", "/api/signup", strings.NewReader("{}"))
			req.Header.Set("Content-Type", "application/json")
			handler.ServeHTTP(httptest.NewRecorder(), req)
			if calls != 1 {
				t.Fatal("invalid signup notified Slack")
			}
		})
	}
}

type failingTransport struct{}

func (failingTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	return nil, errors.New("secret transport error: " + r.URL.String())
}

func TestSlackErrorsRedactSecret(t *testing.T) {
	secret := "https://example.com/secret-token"
	client := &http.Client{Transport: failingTransport{}}
	err := slackNotifier(secret, client)(context.Background(), validSignup())
	if err == nil || strings.Contains(err.Error(), "secret-token") {
		t.Fatalf("unsafe error: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err = slackNotifier(secret, http.DefaultClient)(ctx, validSignup())
	if err == nil || strings.Contains(err.Error(), "secret-token") {
		t.Fatalf("unsafe cancellation error: %v", err)
	}
}

func TestSlackConfiguration(t *testing.T) {
	for _, webhook := range []string{"http://example.com/secret", ":invalid"} {
		if err := configuredSlackNotifier(webhook)(context.Background(), validSignup()); err == nil {
			t.Fatal("invalid webhook configuration accepted")
		}
	}
	// Use a trusted local TLS server; no real Slack requests are made.
	calls := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(200)
	}))
	defer server.Close()
	t.Setenv("SLACK_WEBHOOK_URL", server.URL)
	handler := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)))
	// The default client must reject an untrusted TLS certificate, not silently
	// downgrade or accept it. Environment configuration should enable delivery.
	payload, _ := json.Marshal(validSignup())
	req := httptest.NewRequest("POST", "/api/signup", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != 502 || calls != 0 {
		t.Fatalf("status=%d calls=%d", res.Code, calls)
	}
}

func TestSlackDoesNotFollowRedirects(t *testing.T) {
	calls := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path == "/redirect" {
			http.Redirect(w, r, "/destination", http.StatusTemporaryRedirect)
			return
		}
		w.WriteHeader(200)
	}))
	defer server.Close()
	client := server.Client()
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	err := slackNotifier(server.URL+"/redirect", client)(context.Background(), validSignup())
	if err == nil || calls != 1 {
		t.Fatalf("redirect followed: calls=%d err=%v", calls, err)
	}
}
