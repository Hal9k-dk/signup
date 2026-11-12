.PHONY: dev api assemble build container container-run test test-browser clean

CONTAINER_ENGINE ?= podman
IMAGE ?= localhost/hal9k-signup:dev
PORT ?= 8080

dev:
	go run ./cmd/dev

api:
	go run ./cmd/api

assemble:
	$(MAKE) -C experiences/windows98 test-iso
	go run ./cmd/package

build: assemble
	mkdir -p bin
	CGO_ENABLED=0 go build -trimpath -o bin/hal9k-signup ./cmd/server

# Podman caches intermediate layers; Docker/CI uses the same Dockerfile.
container:
	$(CONTAINER_ENGINE) build $(if $(findstring podman,$(CONTAINER_ENGINE)),--layers) -t $(IMAGE) .

container-run:
	$(CONTAINER_ENGINE) run --rm -p $(PORT):8080 $(IMAGE)

test: assemble
	go test -race ./...
	go vet ./...
	node --test tests/signup-clients.test.cjs
	$(MAKE) -C landing test
	$(MAKE) -C experiences/physics test
	$(MAKE) -C experiences/frontpage98 test
	$(MAKE) -C experiences/survey test
	$(MAKE) -C experiences/terminal test
	$(MAKE) -C experiences/windows98 test

test-browser:
	node tests/browser.cjs
	$(MAKE) -C landing test-browser
	BASE_URL=$${BASE_URL:-http://localhost:8080}/experiences/physics/ $(MAKE) -C experiences/physics test-browser
	BASE_URL=$${BASE_URL:-http://localhost:8080}/experiences/frontpage98/ $(MAKE) -C experiences/frontpage98 test-browser
	BASE_URL=$${BASE_URL:-http://localhost:8080}/experiences/survey/ $(MAKE) -C experiences/survey test-browser
	BASE_URL=$${BASE_URL:-http://localhost:8080}/experiences/terminal/ $(MAKE) -C experiences/terminal test-browser
	BASE_URL=$${BASE_URL:-http://localhost:8080}/experiences/windows98/ $(MAKE) -C experiences/windows98 test-browser

clean:
	rm -rf bin cmd/server/embedded
