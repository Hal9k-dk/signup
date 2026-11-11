package main

import (
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"hackerspace/signup/api"
	"hackerspace/signup/internal/run"
	"hackerspace/signup/internal/site"
	"hackerspace/signup/internal/vmnetwork"
)

func newHandler(logger *slog.Logger, web fs.FS) http.Handler {
	mux := http.NewServeMux()
	apiHandler := api.NewHandler(logger)
	mux.Handle("/api/", apiHandler)
	mux.Handle("/vm/network/", vmnetwork.NewHandler(apiHandler))
	mux.Handle("/", http.FileServer(http.FS(web)))
	return site.Headers(mux)
}

// Assets default to a sibling directory, not the process's working directory.
// This keeps make build && ./bin/hal9k-signup convenient without go:embed's
// multi-gigabyte compiler/object limits. Containers use the same layout.
func assetDirectory() (string, error) {
	if dir := os.Getenv("ASSET_DIR"); dir != "" {
		return dir, nil
	}
	executable, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(executable), "assets"), nil
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)
	dir, err := assetDirectory()
	if err == nil {
		_, err = os.Stat(filepath.Join(dir, "index.html"))
	}
	if err != nil {
		logger.Error("assets not assembled; run make build or set ASSET_DIR", "error", err)
		os.Exit(1)
	}
	run.Serve(newHandler(logger, os.DirFS(dir)), ":8080")
}
