// Package run owns the HTTP process lifecycle, not application routing.
package run

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func Serve(handler http.Handler, defaultAddr string) {
	logger := slog.Default()
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = defaultAddr
	}
	server := &http.Server{Addr: addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	done := make(chan struct{})
	go func() {
		defer close(done)
		<-ctx.Done()
		timeout, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(timeout); err != nil {
			logger.Error("shutdown failed", "error", err)
			_ = server.Close()
		}
	}()
	logger.Info("listening", "addr", addr)
	err := server.ListenAndServe()
	stop()
	<-done
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("server failed", "error", err)
		os.Exit(1)
	}
}
