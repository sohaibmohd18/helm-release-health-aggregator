// Package store provides SQLite-backed persistence for HelmSight.
// Each Helm release is stored as a row with indexed scalar columns for
// filtering plus JSON blobs for the detail fields (pods, workloads, etc.).
package store

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite" // pure-Go SQLite driver (no CGO)
)

const schema = `
CREATE TABLE IF NOT EXISTS releases (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    namespace       TEXT NOT NULL,
    chart_name      TEXT NOT NULL,
    chart_version   TEXT NOT NULL,
    app_version     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'deployed',
    health          TEXT NOT NULL DEFAULT 'Unknown',
    pod_desired     INTEGER NOT NULL DEFAULT 0,
    pod_ready       INTEGER NOT NULL DEFAULT 0,
    drift_count     INTEGER NOT NULL DEFAULT 0,
    version_status  TEXT NOT NULL DEFAULT '{"installed":"","latest":"","upgradeAvailable":false,"severity":"none","latestAppVersion":""}',
    last_reconciled TEXT NOT NULL DEFAULT '',
    first_deployed  TEXT NOT NULL DEFAULT '',
    last_deployed   TEXT NOT NULL DEFAULT '',
    revision        INTEGER NOT NULL DEFAULT 1,
    pods            TEXT NOT NULL DEFAULT '[]',
    workloads       TEXT NOT NULL DEFAULT '[]',
    drift_entries   TEXT NOT NULL DEFAULT '[]',
    history         TEXT NOT NULL DEFAULT '[]',
    chart_defaults  TEXT NOT NULL DEFAULT '{}',
    deployed_values TEXT NOT NULL DEFAULT '{}',
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_releases_namespace ON releases(namespace);
CREATE INDEX IF NOT EXISTS idx_releases_health    ON releases(health);
CREATE INDEX IF NOT EXISTS idx_releases_name      ON releases(name);

CREATE TABLE IF NOT EXISTS events (
    id           TEXT PRIMARY KEY,
    timestamp    TEXT NOT NULL,
    type         TEXT NOT NULL,
    release_name TEXT NOT NULL,
    namespace    TEXT NOT NULL,
    message      TEXT NOT NULL,
    severity     TEXT NOT NULL DEFAULT 'info',
    details      TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_namespace ON events(namespace);
`

// DB wraps a *sql.DB with the HelmSight schema applied.
type DB struct {
	*sql.DB
}

// Open opens (or creates) the SQLite database at path and runs migrations.
func Open(path string) (*DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	// WAL mode for better concurrent read performance
	if _, err := db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		return nil, fmt.Errorf("enable WAL: %w", err)
	}
	if _, err := db.Exec(`PRAGMA foreign_keys=ON`); err != nil {
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}
	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return &DB{db}, nil
}
