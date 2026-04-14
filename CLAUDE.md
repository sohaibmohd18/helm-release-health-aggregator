# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: HelmSight

A full-stack Helm release health aggregator. Platform engineers get a single dashboard showing every Helm release across all namespaces with four signals: pod/workload health, chart version staleness, values drift, and release status.

**Current state:** Parts 1–16 complete. Full stack is operational: Go controller with real k8s informers, SQLite persistence, REST API, WebSocket event feed, and React frontend wired to the real API. Docker image published as `sohaibmohd/helmsights:latest`.

---

## Commands

### Frontend (`web/`)
```bash
make web-dev        # Start Vite dev server at http://localhost:5173
make web-build      # Production build → web/dist/
make web-install    # npm install

cd web && npx tsc --noEmit                          # TypeScript check only
cd web && npx vitest run                             # Run all tests
cd web && npx vitest run src/path/to/file.test.tsx  # Run single test file
cd web && npx vitest --coverage                     # Run with coverage
```

### Backend (Go)
```bash
make build          # Compile → bin/helmsights
make run            # go run ./cmd/controller/...
make test           # go test ./... -v -race
make fmt            # go fmt ./...
make lint           # golangci-lint run ./...
make docker-build   # Docker multi-stage build → sohaibmohd/helmsights:latest
```

### Docker
```bash
# Build and push
docker build -t sohaibmohd/helmsights:latest .
docker push sohaibmohd/helmsights:latest

# Run locally (requires kubeconfig at ~/.kube/config)
docker run -p 8080:8080 -v ~/.kube/config:/home/nonroot/.kube/config sohaibmohd/helmsights:latest
```

### Deploy to Kubernetes
```bash
kubectl apply -k config/deploy/   # Kustomize overlay (namespace: helmsights)
```

---

## Architecture

### Tech stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS v4 |
| State | TanStack Query v5 |
| Charts | Recharts |
| Diff viewer | react-diff-viewer-continued |
| Routing | React Router v7 |
| Backend | Go 1.22, chi v5 router |
| K8s | client-go + helm.sh/helm/v3 SDK |
| Storage | SQLite (modernc.org/sqlite) |
| Real-time | WebSockets (gorilla/websocket) |

### Key architectural decisions

**API client** (`web/src/api/client.ts`):
All TanStack Query hooks call the Go REST API via `fetch('/api/v1/...')`. In development the Vite proxy (`vite.config.ts`) forwards `/api` to `localhost:8080`. Mock data in `web/src/api/mock.ts` is kept for tests only. Set `VITE_API_BASE_URL` env var to bypass the proxy.

**TypeScript contract** (`web/src/types/index.ts`):
These interfaces are the shared contract. The Go backend (Part 15) must return JSON that matches these shapes exactly.

**Controller flow** (`internal/controller/reconciler.go`):
`Watch Helm secrets (owner=helm label) → decode (base64→gzip→JSON) → parallel workers with semaphore (drift diff, version check, health roll-up) → merge → write SQLite + broadcast WS`

- `EventBroadcaster` interface defined in `internal/controller` to avoid import cycle with `internal/api`
- Worker concurrency controlled by buffered channel semaphore (default 4)
- K8s config resolution: explicit `--kubeconfig` flag → in-cluster → `~/.kube/config`

**Health roll-up logic**:
- Failed: any pod in CrashLoopBackOff / OOMKilled, or Helm status = failed
- Degraded: ready < desired for any workload
- Healthy: all workloads at desired capacity, Helm status = deployed
- Unknown: no workloads found

### Directory layout
```
cmd/controller/       # main.go — flags: --kubeconfig, --workers, --addr, --db
internal/
  api/                # chi router, REST handlers, WebSocket hub (ws.go)
  controller/         # k8s informer reconciler + EventBroadcaster interface
  helm/               # Helm secret decoder + values drift diff
  health/             # workload health aggregator (Deployments/SS/DS/Pods)
  registry/           # ArtifactHub + OCI version checker
  store/              # SQLite: db.go (schema+migrations), release_repo.go, event_repo.go
pkg/apis/v1alpha1/    # Shared Go types — JSON tags must match web/src/types/index.ts exactly
config/
  crd/                # CRD YAML manifests
  rbac/               # ClusterRole/Binding/ServiceAccount
  deploy/             # Kustomize overlay (namespace: helmsights)
chart/                # Helm chart for HelmSight itself
web/                  # React frontend (Vite)
  src/
    api/              # client.ts (real API hooks) + mock.ts (test fixtures)
    types/            # TypeScript interfaces (index.ts) — source of truth for JSON shapes
    pages/            # One file per route + colocated .test.tsx files
    components/
      layout/         # Sidebar, Header
      ui/             # shadcn primitives
    hooks/            # useEventsFeed (WebSocket), useKeyboardNav
    lib/              # utils.ts (cn), health.ts (badge helpers), time.ts
```

### JSON contract
`pkg/apis/v1alpha1/types.go` JSON tags must stay in sync with `web/src/types/index.ts`. Notable non-obvious mappings:
- `VersionStatus.Installed` → `json:"deployed"`
- `DriftEntry.DeployedValue` → `json:"userValue"`
- `HelmEvent.Message` → `json:"description"`, `.Details` → `json:"delta"`
- `ClusterSummary.LastUpdated` → `json:"lastScanTime"`
- `NamespaceSummary.Health` → `json:"worstHealth"`

### Color conventions (enforced across all parts)
| Signal | Color |
|--------|-------|
| Healthy | green |
| Degraded | amber |
| Failed | red |
| Unknown | gray |
| Major upgrade | red |
| Minor upgrade | amber |
| Patch upgrade | blue |
| Current | green |

### Tailwind v4 notes
- No `tailwind.config.ts` — configuration is entirely in `web/src/index.css`
- Dark mode uses `.dark` class variant (not `prefers-color-scheme`)
- PostCSS plugin is `@tailwindcss/postcss`, not the legacy `tailwindcss` plugin
- Path alias `@/` resolves to `web/src/`

### SQLite filtering
`internal/store/release_repo.go` uses `json_extract()` to filter on JSON blob columns:
- `version_status` blob: severity (`json_extract(version_status, '$.severity')`), upgradeAvailable
- Multi-namespace filter uses SQL `IN` clause
- `hasDrift` filters on `drift_count > 0` column
