package main

import (
	"hackerspace/signup/api"
	"hackerspace/signup/internal/run"
	"log/slog"
	"os"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)
	run.Serve(api.NewHandler(logger), ":8081")
}
