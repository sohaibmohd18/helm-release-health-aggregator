BINARY_NAME := helmsight
MODULE      := github.com/sohaibmohmd18/helm-release-health-aggregator
IMAGE_NAME  := helmsight
IMAGE_TAG   ?= latest

.PHONY: build run fmt lint test docker-build web-install web-dev web-build generate

## Go targets
build:
	go build -o bin/$(BINARY_NAME) ./cmd/controller/...

run:
	go run ./cmd/controller/...

fmt:
	go fmt ./...

lint:
	golangci-lint run ./...

test:
	go test ./... -v -race -count=1

## Docker
docker-build:
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .

## Frontend targets
web-install:
	cd web && npm install

web-dev:
	cd web && npm run dev

web-build:
	cd web && npm run build

## Code generation (CRD manifests, deepcopy)
generate:
	go generate ./...
