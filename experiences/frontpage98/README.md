# frontpage98

Independent static signup project. Owns everything in public/ and tests/. No imports from other experiences or shared JavaScript. The local signup-client.js is a deliberately small private API adapter, not a generated file.

## Develop

- make dev: serves this project at http://localhost:8080/ with the real logging API included. No other experience is loaded.
- API=http://localhost:8081 make dev: proxy to a separately running API instead.
- ADDR=:8090 make dev: use another port.
- make test: local checks; requires Node for JavaScript syntax checks.
- make test-browser: Playwright interaction tests against the independently served root. Set BASE_URL to test an assembled URL instead. See the root README for installing test-only Playwright.

No frontend build is required. public/ is the complete project output; the root packager copies it unchanged. Shared logo files are served under /shared/ by the development host and final server. The API contract is ../../contracts/signup-api.md.

All submissions currently log personal data: use synthetic data. 
