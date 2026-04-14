package store

import (
	"encoding/json"
	"time"

	v1alpha1 "github.com/sohaibmohmd18/helmsightss/pkg/apis/v1alpha1"
)

// InsertEvent stores a single Helm event.
func (db *DB) InsertEvent(e v1alpha1.HelmEvent) error {
	details, _ := json.Marshal(e.Details)
	_, err := db.Exec(`
		INSERT OR IGNORE INTO events (id, timestamp, type, release_name, namespace, message, severity, details)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		e.ID, e.Timestamp, string(e.Type), e.Release, e.Namespace,
		e.Message, e.Severity, string(details),
	)
	return err
}

// ListEvents returns the most recent events (up to limit), newest first.
func (db *DB) ListEvents(limit int) ([]v1alpha1.HelmEvent, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := db.Query(`
		SELECT id, timestamp, type, release_name, namespace, message, severity, details
		FROM events
		ORDER BY timestamp DESC
		LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []v1alpha1.HelmEvent
	for rows.Next() {
		var e v1alpha1.HelmEvent
		var detailsRaw string
		if err := rows.Scan(&e.ID, &e.Timestamp, &e.Type, &e.Release,
			&e.Namespace, &e.Message, &e.Severity, &detailsRaw); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(detailsRaw), &e.Details)
		events = append(events, e)
	}
	if events == nil {
		events = []v1alpha1.HelmEvent{}
	}
	return events, rows.Err()
}

// PruneOldEvents deletes events older than the given duration.
func (db *DB) PruneOldEvents(olderThan time.Duration) error {
	cutoff := time.Now().UTC().Add(-olderThan).Format(time.RFC3339)
	_, err := db.Exec(`DELETE FROM events WHERE timestamp < ?`, cutoff)
	return err
}
