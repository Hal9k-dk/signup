.PHONY: dev test test-browser

dev:
	cd ../.. && go run ./cmd/dev -project windows98 $(if $(API),-api $(API))

test:
	node --check public/app.js
	node --check public/install.js
	node --check public/handover.js
	node --check public/publishing.js
	node --check publish.cjs
	node --test tests/config.test.cjs tests/install.test.cjs tests/handover.test.cjs

test-browser:
	node tests/browser.cjs

.PHONY: test-raw-browser
test-raw-browser:
	node tests/raw-browser.cjs

.PHONY: test-loader-browser
test-loader-browser:
	node tests/loader-browser.cjs

.PHONY: test-layout-browser
test-layout-browser:
	node tests/layout-browser.cjs

.PHONY: test-tools-browser
test-tools-browser:
	node tests/tools-browser.cjs

.PHONY: test-iso
test-iso:
	mkdir -p public/downloads
	xorriso -as mkisofs -V HAL9K_TEST -o public/downloads/hal9k-test.iso test-cd
