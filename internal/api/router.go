package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
)

// NewRouter assembles the full chi router with all routes mounted.
func NewRouter(s *Server, log *zap.Logger) http.Handler {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(zapLogger(log))
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(corsMiddleware)

	// Health probe — used by Kubernetes liveness / readiness
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// REST API
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/cluster/summary", s.handleClusterSummary)
		r.Get("/namespaces/summaries", s.handleNamespaceSummaries)
		r.Get("/releases", s.handleListReleases)
		r.Get("/releases/{namespace}/{name}", s.handleGetRelease)
		r.Get("/upgrades", s.handleUpgrades)
		r.Get("/events", s.handleListEvents)
		r.Get("/ws/events", s.handleWSEvents)
	})

	// Serve the compiled Vite frontend from web/dist/ (if present)
	fileServer(r, "/", http.Dir("web/dist"))

	return r
}

// fileServer serves static files from dir at the given pattern prefix.
// Every unknown route falls through to index.html (SPA mode).
func fileServer(r chi.Router, path string, root http.FileSystem) {
	fs := http.StripPrefix(path, http.FileServer(root))
	r.Get(path+"*", func(w http.ResponseWriter, req *http.Request) {
		// Try serving the file; fall back to index.html for SPA routing
		f, err := root.Open(req.URL.Path)
		if err != nil {
			req.URL.Path = "/"
		} else {
			_ = f.Close()
		}
		fs.ServeHTTP(w, req)
	})
}

// zapLogger is a chi middleware that logs each request with zap.
func zapLogger(log *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			start := time.Now()
			defer func() {
				log.Info("http",
					zap.String("method", r.Method),
					zap.String("path", r.URL.Path),
					zap.Int("status", ww.Status()),
					zap.Duration("duration", time.Since(start)),
					zap.String("reqID", middleware.GetReqID(r.Context())),
				)
			}()
			next.ServeHTTP(ww, r)
		})
	}
}

// corsMiddleware adds permissive CORS headers (development / in-cluster use only).
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
