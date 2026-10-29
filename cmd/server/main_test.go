package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"testing"
)

func TestEmbeddedAssembly(t *testing.T) {
	if _, err := assets.ReadFile("embedded/index.html"); err != nil {
		t.Skip("run make assemble to test generated embedded assets")
	}
	handler := newHandler(slog.New(slog.NewTextHandler(io.Discard, nil)))
	catalogue := httptest.NewRecorder()
	handler.ServeHTTP(catalogue, httptest.NewRequest("GET", "/experiences.json", nil))
	var entries []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(catalogue.Body.Bytes(), &entries); err != nil {
		t.Fatal(err)
	}
	paths := []string{"/", "/styles.css", "/app.js", "/shared/hal9k-logo.svg"}
	for _, entry := range entries {
		paths = append(paths, "/experiences/"+entry.ID+"/", "/experiences/"+entry.ID+"/app.js", "/experiences/"+entry.ID+"/signup-client.js")
	}
	for _, path := range paths {
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, httptest.NewRequest("GET", path, nil))
		if res.Code != 200 {
			t.Errorf("%s: %d", path, res.Code)
		}
		if res.Header().Get("Content-Security-Policy") == "" {
			t.Error("missing CSP")
		}
	}
}
