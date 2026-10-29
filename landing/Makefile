.PHONY: dev test test-browser

dev:
	cd .. && go run ./cmd/dev

test:
	node --check public/app.js

test-browser:
	node tests/browser.cjs
