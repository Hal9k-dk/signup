.PHONY: dev test test-browser

dev:
	cd ../.. && go run ./cmd/dev -project terminal $(if $(API),-api $(API))

test:
	node --check public/main.js
	node --check public/terminal.js
	node --check public/renderer.js
	node --check public/signup-client.js

test-browser:
	node tests/browser.cjs
