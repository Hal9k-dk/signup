.PHONY: dev test test-browser

dev:
	cd ../.. && go run ./cmd/dev -project physics $(if $(API),-api $(API))

test:
	node --test tests/stack-check.test.cjs

test-browser:
	node tests/browser.cjs
