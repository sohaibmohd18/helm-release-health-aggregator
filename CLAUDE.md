# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: HelmSight

A full-stack Helm release health aggregator. Platform engineers get a single dashboard showing every Helm release across all namespaces with four signals: pod/workload health, chart version staleness, values drift, and release status.

**Current state:** Part 1 complete (scaffold + types + mock layer). Working through a strict waterfall — each part must be approved before the next begins.

---

## Commands

### Frontend (`web/`)
```bash
make web-dev        # Start Vite dev server at http://localhost:5173
make web-build      # Production build → web/dist/
make web-install    # npm install

# TypeScript check only (no emit)
cd web && npx tsc --noEmit

# Single test (once Vitest is configured in Part 8)
cd web && npx vitest run src/path/to/file.test.tsx
```

### Backend (Go)
```bash
make build          # Compile → bin/helmsight
make run            # go run ./cmd/controller/...
make test           # go test ./... -v -race
make fmt            # go fmt ./...
make lint           # golangci-lint run ./...
make docker-build   # Docker multi-stage build
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

**Mock → real API swap contract** (`web/src/api/client.ts`):
All TanStack Query hooks source data from `web/src/api/mock.ts`. In Part 16, only `client.ts` changes — every `queryFn` body swaps a mock import for a `fetch(BASE_URL + '/api/v1/...')` call. No component code changes.

**TypeScript contract** (`web/src/types/index.ts`):
These interfaces are the shared contract. The Go backend (Part 15) must return JSON that matches these shapes exactly.

**Controller flow** (Part 14+):
`Watch Helm secrets → decode (base64→gzip→JSON) → parallel workers (drift diff, version check, health roll-up) → merge result → write CRD + SQLite + broadcast WS`

**Health roll-up logic**:
- Failed: any pod in CrashLoopBackOff / OOMKilled, or Helm status = failed
- Degraded: ready < desired for any workload
- Healthy: all workloads at desired capacity, Helm status = deployed
- Unknown: no workloads found

### Directory layout
```
cmd/controller/       # main.go entry point
internal/
  api/                # chi router, REST handlers, WebSocket hub
  controller/         # controller-runtime reconciler
  helm/               # Helm secret decoder, values drift
  health/             # workload health aggregator
  registry/           # ArtifactHub + OCI version checker
  store/              # SQLite repositories + migrations
pkg/apis/v1alpha1/    # HelmReleaseReport CRD Go types
config/
  crd/                # CRD YAML manifests
  rbac/               # ClusterRole/Binding/ServiceAccount
  deploy/             # Kustomize EKS overlay
chart/                # Helm chart for HelmSight itself
web/                  # React frontend
  src/
    api/              # client.ts (hooks) + mock.ts (mock data)
    types/            # TypeScript interfaces (index.ts)
    pages/            # One file per route
    components/ui/    # shadcn primitives
    hooks/            # Custom React hooks (Part 16+)
    lib/              # utils.ts (cn helper)
```

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
