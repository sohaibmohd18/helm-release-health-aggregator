package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"

	"github.com/sohaibmohmd18/helm-release-health-aggregator/internal/api"
	"github.com/sohaibmohmd18/helm-release-health-aggregator/internal/controller"
	"github.com/sohaibmohmd18/helm-release-health-aggregator/internal/store"
)

func main() {
	var (
		addr        = flag.String("addr", envOrDefault("HELMSIGHT_ADDR", ":8080"), "HTTP listen address")
		dbPath      = flag.String("db", envOrDefault("HELMSIGHT_DB", "helmsight.db"), "SQLite database path")
		clusterName = flag.String("cluster", envOrDefault("HELMSIGHT_CLUSTER", "local"), "Cluster display name")
		dev         = flag.Bool("dev", false, "Development mode (human-readable logs)")
	)
	flag.Parse()

	// Logger
	log := newLogger(*dev)
	defer func() { _ = log.Sync() }()

	log.Info("HelmSight starting",
		zap.String("addr", *addr),
		zap.String("db", *dbPath),
		zap.String("cluster", *clusterName),
	)

	// Store
	db, err := store.Open(*dbPath)
	if err != nil {
		log.Fatal("open store", zap.Error(err))
	}
	defer db.Close()

	// WebSocket hub
	hub := api.NewHub(log)

	// HTTP server
	srv := api.NewServer(db, hub, *clusterName, log)
	router := api.NewRouter(srv, log)

	httpSrv := &http.Server{
		Addr:         *addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Reconciler (stub in Part 9 — wired to Kubernetes in Part 14)
	rec := controller.NewReconciler(db, log)
	if err := rec.Start(); err != nil {
		log.Fatal("start reconciler", zap.Error(err))
	}

	// Start HTTP in background
	go func() {
		log.Info("HTTP server listening", zap.String("addr", *addr))
		if err := httpSrv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			log.Fatal("http server", zap.Error(err))
		}
	}()

	// Graceful shutdown on SIGTERM / SIGINT
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit

	log.Info("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(ctx); err != nil {
		log.Error("http shutdown", zap.Error(err))
	}
	log.Info("goodbye")
}

func newLogger(dev bool) *zap.Logger {
	var log *zap.Logger
	var err error
	if dev {
		log, err = zap.NewDevelopment()
	} else {
		log, err = zap.NewProduction()
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "init logger: %v\n", err)
		os.Exit(1)
	}
	return log
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
