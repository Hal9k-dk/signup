.PHONY: dev api assemble build test test-browser clean

dev:
	go run ./cmd/dev

api:
	go run ./cmd/api

assemble:
	go run ./cmd/package

build: assemble
	mkdir -p bin
	CGO_ENABLED=0 go build -trimpath -o bin/hal9k-signup ./cmd/server

test: assemble
	go test -race ./...
	go vet ./...
	$(MAKE) -C landing test
	$(MAKE) -C experiences/physics test
	$(MAKE) -C experiences/frontpage98 test
	$(MAKE) -C experiences/survey test
	$(MAKE) -C experiences/terminal test

test-browser:
	node tests/browser.cjs
	$(MAKE) -C landing test-browser
	BASE_URL=$${BASE_URL:-http://localhost:8080}/experiences/physics/ $(MAKE) -C experiences/physics test-browser
	BASE_URL=$${BASE_URL:-http://localhost:8080}/experiences/frontpage98/ $(MAKE) -C experiences/frontpage98 test-browser
	BASE_URL=$${BASE_URL:-http://localhost:8080}/experiences/survey/ $(MAKE) -C experiences/survey test-browser
	BASE_URL=$${BASE_URL:-http://localhost:8080}/experiences/terminal/ $(MAKE) -C experiences/terminal test-browser

clean:
	rm -rf bin cmd/server/embedded
	mkdir -p cmd/server/embedded
	printf '%s\n' 'Run make assemble.' > cmd/server/embedded/placeholder.txt
