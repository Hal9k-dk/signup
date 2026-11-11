package main

import (
	"encoding/json"
	"io"
	"io/fs"
	"log/slog"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func TestDiskAssembly(t *testing.T) {
	assets := os.DirFS("../../bin/assets")
	if _, err := fs.Stat(assets, "index.html"); err != nil {
		t.Skip("run make assemble to test generated assets")
	}
	handler := newHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), assets)
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
		paths = append(paths, "/experiences/"+entry.ID+"/")
		err := fs.WalkDir(assets, "experiences/"+entry.ID, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if !d.IsDir() && d.Name() != "index.html" {
				paths = append(paths, "/"+path)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
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

func TestAssetDirectory(t *testing.T) {
	t.Setenv("ASSET_DIR", "")
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	dir, err := assetDirectory()
	if err != nil || dir != filepath.Join(filepath.Dir(executable), "assets") {
		t.Fatalf("asset directory: %q, %v", dir, err)
	}
	t.Setenv("ASSET_DIR", "/custom/assets")
	dir, err = assetDirectory()
	if err != nil || dir != "/custom/assets" {
		t.Fatalf("override: %q, %v", dir, err)
	}
}

func TestStaticServing(t *testing.T) {
	web := fstest.MapFS{"index.html": {Data: []byte("hello")}, "disc.iso": {Data: []byte("0123456789")}}
	handler := newHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), web)
	request := httptest.NewRequest("GET", "/disc.iso", nil)
	request.Header.Set("Range", "bytes=2-5")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 206 || response.Body.String() != "2345" {
		t.Fatalf("range: %d %q", response.Code, response.Body.String())
	}
	for _, path := range []string{"/", "/experiences/windows98/missing", "/api/health"} {
		response = httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Header().Get("Content-Security-Policy") == "" {
			t.Fatal("missing browser headers")
		}
	}
}
