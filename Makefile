BINARY_NAME := helmsights
MODULE      := github.com/sohaibmohmd18/helm-release-health-aggregator
IMAGE_NAME  := sohaibmohd/helmsights
IMAGE_TAG   ?= latest

.PHONY: build run fmt lint test docker-build docker-push docker-deploy web-install web-dev web-build generate

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
	docker build --platform linux/amd64 -t $(IMAGE_NAME):$(IMAGE_TAG) .

docker-push:
	docker push $(IMAGE_NAME):$(IMAGE_TAG)

docker-deploy: docker-build docker-push
	kubectl rollout restart deploy/helmsights -n helmsights
	kubectl rollout status deploy/helmsights -n helmsights

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
