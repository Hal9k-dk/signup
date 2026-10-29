.PHONY: dev test test-browser

dev:
	cd ../.. && go run ./cmd/dev -project frontpage98 $(if $(API),-api $(API))

test:
	node --check public/app.js

test-browser:
	node tests/browser.cjs
