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
	"github.com/sohaibmohmd18/helm-release-health-aggregator/internal/health"
	"github.com/sohaibmohmd18/helm-release-health-aggregator/internal/registry"
	"github.com/sohaibmohmd18/helm-release-health-aggregator/internal/store"
)

func main() {
	var (
		addr        = flag.String("addr", envOrDefault("HELMSIGHT_ADDR", ":8080"), "HTTP listen address")
		dbPath      = flag.String("db", envOrDefault("HELMSIGHT_DB", "helmsight.db"), "SQLite database path")
		clusterName = flag.String("cluster", envOrDefault("HELMSIGHT_CLUSTER", "local"), "Cluster display name")
		kubeconfig  = flag.String("kubeconfig", os.Getenv("KUBECONFIG"), "Path to kubeconfig (defaults to in-cluster, then ~/.kube/config)")
		workers     = flag.Int("workers", 4, "Concurrent reconcile workers")
		dev         = flag.Bool("dev", false, "Development mode (human-readable logs)")
	)
	flag.Parse()

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

	// Cancellable root context — cancelled on SIGTERM/SIGINT
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Reconciler
	rec, err := controller.NewReconciler(db, hub, registry.NewChecker(), health.NewAggregator(), log, controller.Config{
		KubeconfigPath: *kubeconfig,
		Workers:        *workers,
	})
	if err != nil {
		log.Fatal("build reconciler", zap.Error(err))
	}

	go func() {
		if err := rec.Start(ctx); err != nil && !errors.Is(err, context.Canceled) {
			log.Error("reconciler exited", zap.Error(err))
		}
	}()

	// Start HTTP server
	go func() {
		log.Info("HTTP server listening", zap.String("addr", *addr))
		if err := httpSrv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			log.Fatal("http server", zap.Error(err))
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit

	log.Info("shutting down")
	cancel() // stop reconciler

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutCancel()
	if err := httpSrv.Shutdown(shutCtx); err != nil {
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
