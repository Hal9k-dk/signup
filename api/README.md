# Shared signup API

Independent of every frontend. Standard-library Go handler, server-side validation and structured JSON logging. The sole integration contract is `../contracts/signup-api.md`.

- `make dev`: API-only server on :8081 (override with ADDR).
- `make test`: validation, strict decoding, error responses and logging tests.

`NewHandler(logger)` is composed into the final application and, by default, the development host. `cmd/api` exposes the same handler independently. It reads `SLACK_WEBHOOK_URL` from the process environment at initialization. When set, every valid signup is logged and synchronously posted to Slack as plain text with all signup fields. Delivery has a five-second timeout; failures return HTTP 502 and log a redacted error without exposing the webhook URL. Invalid requests never call Slack. Without a webhook, the API warns at startup and retains log-only development behavior.

Keep the webhook in a runtime `.env` file and pass it with `docker run --env-file .env`; see the root README. There is no database, durable queue, automatic retry or real membership processing. A retry after an ambiguous failure may duplicate a Slack notification. Restrict Slack channel access and retention: accepted personal fields are both logged and sent to Slack when configured. Tests use local HTTP servers, never a real webhook.
