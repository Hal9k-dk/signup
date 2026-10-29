# terminal

Independent CRT-rendered terminal signup experience. Owns everything in `public/` and `tests/`; it does not import frontend code from another experience. Output is paced at 2400 baud (8N1). Submitted input is echoed into scrollback, which is retained without a line-count cap; the visible screen scrolls normally as output grows. The terminal accepts simple line input.

The Danish signup interview collects the shared signup API fields, validates email, Danish postal code, and a real non-future `dd-mm-yyyy` birth date, and offers `EDIT <number>` on the review screen. The user must confirm with `JA` before the private API adapter submits the documented signup payload. Server-side validation errors route back to the relevant field. Confirmed submissions are real signup requests delivered to hal9k through the shared API and Slack. Personal data is also logged; use synthetic data during development and testing.

## Develop

- `make dev`: serves this experience at `http://localhost:8080/` with the shared signup API (configure `SLACK_WEBHOOK_URL` for delivery).
- `API=http://localhost:8081 make dev`: proxy to a separately running API.
- `ADDR=:8090 make dev`: select another port.
- `make test`: local JavaScript syntax checks.
- `make test-browser`: Playwright interaction test (test-only dependency).

No frontend build is required. `public/` is the complete project output and is copied unchanged by the root packager. See `../../contracts/signup-api.md` for the HTTP API contract.
