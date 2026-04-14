# ─── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci --prefer-offline

COPY web/ ./
RUN npm run build

# ─── Stage 2: Build Go binary ─────────────────────────────────────────────────
FROM golang:1.26-alpine AS go-builder

# Install git (needed for VCS stamping) and ca-certs
RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Download dependencies before copying source for better layer caching
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Copy compiled frontend so it's embedded in the final binary's working dir
COPY --from=frontend-builder /app/web/dist ./web/dist

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" \
    -o /helmsight ./cmd/controller/...

# ─── Stage 3: Minimal runtime image ───────────────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot

# Copy TLS certificates from builder (needed for HTTPS calls to ArtifactHub)
COPY --from=go-builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the binary
COPY --from=go-builder /helmsight /helmsight

# Copy the static frontend so the server can serve it from web/dist/
COPY --from=frontend-builder /app/web/dist /web/dist

EXPOSE 8080

# distroless nonroot image runs as uid 65532
USER nonroot:nonroot

ENTRYPOINT ["/helmsight"]
