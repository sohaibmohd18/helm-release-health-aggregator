// Package controller contains the controller-runtime reconciler that watches
// Helm release secrets and drives the store + event stream updates.
//
// Real Kubernetes integration added in Part 14.
package controller

import (
	"go.uber.org/zap"

	"github.com/sohaibmohmd18/helm-release-health-aggregator/internal/store"
)

// Reconciler watches Helm release secrets and writes to the store.
type Reconciler struct {
	db  *store.DB
	log *zap.Logger
}

// NewReconciler creates a Reconciler.
func NewReconciler(db *store.DB, log *zap.Logger) *Reconciler {
	return &Reconciler{db: db, log: log}
}

// Start begins the reconcile loop.  Stub — real implementation in Part 14.
func (rec *Reconciler) Start() error {
	rec.log.Info("reconciler stub started — no Kubernetes connection in Part 9")
	return nil
}
