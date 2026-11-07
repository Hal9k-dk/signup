package main

import (
	"embed"
	"io/fs"
	"log/slog"
	"net/http"
	"os"

	"hackerspace/signup/api"
	"hackerspace/signup/internal/run"
	"hackerspace/signup/internal/site"
	"hackerspace/signup/internal/vmnetwork"
)

// Assemble assets before compiling: make build (or go generate ./cmd/server).
//
//go:generate go run ../package -root ../..
//go:embed all:embedded
var assets embed.FS

func newHandler(logger *slog.Logger) http.Handler {
	web, err := fs.Sub(assets, "embedded")
	if err != nil {
		panic(err)
	}
	mux := http.NewServeMux()
	apiHandler := api.NewHandler(logger)
	mux.Handle("/api/", apiHandler)
	mux.Handle("/vm/network/", vmnetwork.NewHandler(apiHandler))
	mux.Handle("/", http.FileServer(http.FS(web)))
	return site.Headers(mux)
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)
	if _, err := assets.ReadFile("embedded/index.html"); err != nil {
		logger.Error("assets not assembled; run make build")
		os.Exit(1)
	}
	run.Serve(newHandler(logger), ":8080")
}
