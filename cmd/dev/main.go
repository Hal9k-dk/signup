// dev serves project source without assembling or embedding. By default it
// includes the real API; -api proxies to an independently running API instead.
package main

import (
	"flag"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"

	"hackerspace/signup/api"
	"hackerspace/signup/internal/run"
	"hackerspace/signup/internal/site"
)

func main() {
	root := flag.String("root", ".", "repository root")
	project := flag.String("project", "", "serve only this experience; empty serves all")
	upstream := flag.String("api", "", "optional upstream API URL")
	flag.Parse()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)
	absolute, err := filepath.Abs(*root)
	if err != nil {
		panic(err)
	}
	frontend, err := site.Live(absolute, *project)
	if err != nil {
		logger.Error("invalid projects", "error", err)
		os.Exit(1)
	}
	apiHandler := api.NewHandler(logger)
	if *upstream != "" {
		target, err := url.Parse(*upstream)
		if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") {
			logger.Error("invalid API URL")
			os.Exit(1)
		}
		apiHandler = httputil.NewSingleHostReverseProxy(target)
	}
	mux := http.NewServeMux()
	mux.Handle("/api/", apiHandler)
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		frontend.ServeHTTP(w, r)
	}))
	run.Serve(site.Headers(mux), ":8080")
}
