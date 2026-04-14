package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	v1alpha1 "github.com/sohaibmohmd18/helm-release-health-aggregator/pkg/apis/v1alpha1"
	"github.com/sohaibmohmd18/helm-release-health-aggregator/internal/store"
)

// Server holds the shared dependencies used by all HTTP handlers.
type Server struct {
	db          *store.DB
	hub         *Hub
	clusterName string
	log         *zap.Logger
}

// NewServer creates a Server.
func NewServer(db *store.DB, hub *Hub, clusterName string, log *zap.Logger) *Server {
	return &Server{db: db, hub: hub, clusterName: clusterName, log: log}
}

// ---------------------------------------------------------------------------
// GET /api/v1/cluster/summary
// ---------------------------------------------------------------------------

func (s *Server) handleClusterSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := s.db.ClusterSummary(s.clusterName)
	if err != nil {
		s.log.Error("cluster summary", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, summary)
}

// ---------------------------------------------------------------------------
// GET /api/v1/namespaces/summaries
// ---------------------------------------------------------------------------

func (s *Server) handleNamespaceSummaries(w http.ResponseWriter, r *http.Request) {
	summaries, err := s.db.NamespaceSummaries()
	if err != nil {
		s.log.Error("namespace summaries", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, summaries)
}

// ---------------------------------------------------------------------------
// GET /api/v1/releases
// ---------------------------------------------------------------------------

func (s *Server) handleListReleases(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	page, _ := strconv.Atoi(q.Get("page"))
	pageSize, _ := strconv.Atoi(q.Get("pageSize"))

	var healthFilters []v1alpha1.HealthStatus
	if h := q.Get("health"); h != "" {
		for _, v := range strings.Split(h, ",") {
			healthFilters = append(healthFilters, v1alpha1.HealthStatus(strings.TrimSpace(v)))
		}
	}

	// Support comma-separated or repeated namespace params.
	var namespaces []string
	for _, ns := range q["namespace"] {
		for _, n := range strings.Split(ns, ",") {
			if t := strings.TrimSpace(n); t != "" {
				namespaces = append(namespaces, t)
			}
		}
	}

	var upgradeAvailable *bool
	if v := q.Get("upgradeAvailable"); v == "true" {
		t := true
		upgradeAvailable = &t
	} else if v == "false" {
		f := false
		upgradeAvailable = &f
	}

	var hasDrift *bool
	if v := q.Get("hasDrift"); v == "true" {
		t := true
		hasDrift = &t
	} else if v == "false" {
		f := false
		hasDrift = &f
	}

	filters := v1alpha1.ReleaseFilters{
		Namespaces:       namespaces,
		Health:           healthFilters,
		Search:           q.Get("search"),
		SortBy:           q.Get("sort"),
		SortOrder:        q.Get("order"),
		Page:             page,
		PageSize:         pageSize,
		UpgradeAvailable: upgradeAvailable,
		HasDrift:         hasDrift,
	}

	releases, total, err := s.db.ListReleases(filters)
	if err != nil {
		s.log.Error("list releases", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if filters.Page < 1 {
		filters.Page = 1
	}
	if filters.PageSize < 1 {
		filters.PageSize = 25
	}

	writeJSON(w, v1alpha1.ListResponse[v1alpha1.Release]{
		Items:    releases,
		Total:    total,
		Page:     filters.Page,
		PageSize: filters.PageSize,
	})
}

// ---------------------------------------------------------------------------
// GET /api/v1/releases/{namespace}/{name}
// ---------------------------------------------------------------------------

func (s *Server) handleGetRelease(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	if namespace == "" || name == "" {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}

	detail, err := s.db.GetRelease(namespace, name)
	if err != nil {
		s.log.Error("get release", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if detail == nil {
		writeError(w, http.StatusNotFound, "release not found")
		return
	}
	writeJSON(w, detail)
}

// ---------------------------------------------------------------------------
// GET /api/v1/upgrades
// ---------------------------------------------------------------------------

func (s *Server) handleUpgrades(w http.ResponseWriter, r *http.Request) {
	candidates, err := s.db.UpgradeCandidates()
	if err != nil {
		s.log.Error("upgrade candidates", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, candidates)
}

// ---------------------------------------------------------------------------
// GET /api/v1/events
// ---------------------------------------------------------------------------

func (s *Server) handleListEvents(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	events, err := s.db.ListEvents(limit)
	if err != nil {
		s.log.Error("list events", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, events)
}

// ---------------------------------------------------------------------------
// WS /api/v1/ws/events
// ---------------------------------------------------------------------------

func (s *Server) handleWSEvents(w http.ResponseWriter, r *http.Request) {
	s.hub.ServeWS(w, r)
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// headers already sent; nothing useful we can do
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
