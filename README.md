# HelmSight

A full-stack Helm release health aggregator for Kubernetes platform engineers. HelmSight gives you a single dashboard showing every Helm release across all namespaces, surfacing four key signals in real time:

- **Pod/workload health** — CrashLoopBackOff, OOMKilled, ready vs desired count
- **Chart version staleness** — major, minor, and patch upgrades available via ArtifactHub/OCI
- **Values drift** — diff between deployed and desired Helm values
- **Release status** — Helm-reported state (deployed, failed, pending, etc.)

---

## How It Works

```
Kubernetes Secrets (Helm state)
         │
         ▼
  k8s informer (client-go)
         │  watches owner=helm secrets
         ▼
  Reconciler (4 parallel workers)
    ├── Decode secret  (base64 → gzip → JSON)
    ├── Health roll-up (Deployments / StatefulSets / DaemonSets / Pods)
    ├── Values drift   (deployed vs current values diff)
    └── Version check  (ArtifactHub + OCI registry)
         │
         ▼
    SQLite store  ──────► REST API (chi)  ──► React frontend
                                │
                          WebSocket hub  ──► live event feed
```

**Health roll-up rules:**

| Status | Condition |
|--------|-----------|
| Failed | Any pod in CrashLoopBackOff / OOMKilled, or Helm status = failed |
| Degraded | ready < desired for any workload |
| Healthy | All workloads at desired capacity, Helm status = deployed |
| Unknown | No workloads found |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS v4 |
| State | TanStack Query v5 |
| Charts | Recharts |
| Routing | React Router v7 |
| Backend | Go 1.25, chi v5 router |
| Kubernetes | client-go informers + helm.sh/helm/v3 SDK |
| Storage | SQLite (modernc.org/sqlite — pure Go, no CGo) |
| Real-time | WebSockets (gorilla/websocket) |
| Container | Docker multi-stage build → distroless nonroot |

---

## Getting Started (Local Development)

### Prerequisites

- Go 1.22+
- Node.js 20+
- A running Kubernetes cluster with Helm releases (or `~/.kube/config` pointing to one)

### 1. Install frontend dependencies

```bash
make web-install
```

### 2. Start the Go backend

```bash
# Reads ~/.kube/config by default
make run

# Or with explicit flags
go run ./cmd/controller/... \
  --kubeconfig ~/.kube/config \
  --cluster my-cluster \
  --dev               # human-readable logs
```

The backend starts at `http://localhost:8080` and begins watching Helm secrets immediately.

### 3. Start the frontend dev server

```bash
make web-dev
# Opens http://localhost:5173
```

The Vite dev server proxies all `/api` requests to `localhost:8080` — no CORS configuration needed.

---

## Building

```bash
# Go binary
make build            # → bin/helmsight

# Frontend production build
make web-build        # → web/dist/

# Docker image (linux/amd64)
make docker-build     # → sohaibmohd/helmsight:latest
```

The Go binary serves the compiled frontend from `web/dist/` at runtime — a single binary deployment.

---

## Deploy to Kubernetes

### Using Kustomize

```bash
kubectl create namespace helmsight
kubectl apply -k config/deploy/
```

This creates:
- `ServiceAccount` + `ClusterRole` + `ClusterRoleBinding` (read secrets, pods, workloads cluster-wide)
- `Deployment` (1 replica, distroless nonroot, `readOnlyRootFilesystem`)
- `ClusterIP Service` on port 80 → 8080

### Using the published image

The deployment references `sohaibmohd/helmsight:latest` from Docker Hub — no local build needed.

```bash
docker pull sohaibmohd/helmsight:latest
```

### Rolling deploy after image update

```bash
make docker-deploy
# Runs: docker-build → docker-push → kubectl rollout restart → kubectl rollout status
```

### Expose the UI

Port-forward for quick access:

```bash
kubectl port-forward -n helmsight svc/helmsight 8080:80
# Open http://localhost:8080
```

Add an Ingress or LoadBalancer in front of the service for persistent access.

---

## Configuration

All options are settable via flags or environment variables:

| Flag | Env var | Default | Description |
|------|---------|---------|-------------|
| `--addr` | `HELMSIGHT_ADDR` | `:8080` | HTTP listen address |
| `--db` | `HELMSIGHT_DB` | `helmsight.db` | SQLite database path |
| `--cluster` | `HELMSIGHT_CLUSTER` | `local` | Cluster display name shown in the UI |
| `--kubeconfig` | `KUBECONFIG` | in-cluster → `~/.kube/config` | Path to kubeconfig |
| `--workers` | — | `4` | Concurrent reconcile workers |
| `--dev` | — | `false` | Human-readable (development) log format |

---

## REST API

All endpoints are under `/api/v1`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/cluster/summary` | Aggregated cluster health counts |
| `GET` | `/api/v1/namespaces/summaries` | Per-namespace health roll-ups |
| `GET` | `/api/v1/releases` | Paginated release list (supports filters) |
| `GET` | `/api/v1/releases/{namespace}/{name}` | Full release detail with drift + history |
| `GET` | `/api/v1/upgrades` | All releases with available upgrades |
| `GET` | `/api/v1/events` | Recent Helm events |
| `GET` | `/api/v1/ws/events` | WebSocket stream — live events |
| `GET` | `/healthz` | Liveness / readiness probe |

### Release list query parameters

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `namespace` | string | `default,monitoring` | Comma-separated namespace filter |
| `health` | string | `failed,degraded` | Comma-separated health status filter |
| `upgradeAvailable` | bool | `true` | Filter to releases with upgrades |
| `hasDrift` | bool | `true` | Filter to releases with values drift |
| `search` | string | `nginx` | Substring match on release name |
| `page` | int | `1` | Page number (1-based) |
| `pageSize` | int | `25` | Results per page |

---

## Project Structure

```
cmd/controller/       # Binary entry point (main.go)
internal/
  api/                # HTTP router, REST handlers, WebSocket hub
  controller/         # k8s informer reconciler
  helm/               # Helm secret decoder, values drift diff
  health/             # Workload health aggregator
  registry/           # ArtifactHub + OCI version checker
  store/              # SQLite schema, migrations, repositories
pkg/apis/v1alpha1/    # Shared Go types (JSON tags match TypeScript exactly)
config/
  crd/                # CRD YAML manifests
  rbac/               # ClusterRole / Binding / ServiceAccount
  deploy/             # Kustomize overlay (namespace: helmsight)
web/                  # React + Vite frontend
  src/
    api/              # TanStack Query hooks (client.ts) + test fixtures (mock.ts)
    types/            # TypeScript interfaces — source of truth for API shapes
    pages/            # Route-level components + colocated tests
    components/       # Layout components + shadcn/ui primitives
    hooks/            # useEventsFeed (WebSocket), useKeyboardNav
    lib/              # cn helper, health badge utilities, time formatting
```

---

## Running Tests

```bash
# Go (with race detector)
make test

# Frontend (Vitest)
cd web && npx vitest run

# Frontend with coverage
cd web && npx vitest --coverage

# TypeScript type-check only
cd web && npx tsc --noEmit
```

---

## RBAC Permissions

HelmSight runs with a `ClusterRole` that grants **read-only** access to:

- `secrets` — to watch Helm release state across all namespaces
- `pods`, `deployments`, `statefulsets`, `daemonsets`, `replicasets` — for workload health aggregation

Full CRUD is granted only on its own `helmsightreports.helmsight.io` CRD resources.
