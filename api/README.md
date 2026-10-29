# Shared signup API

Independent of every frontend. Standard-library Go handler, server-side validation and structured JSON logging. The sole integration contract is `../contracts/signup-api.md`.

- `make dev`: API-only server on :8081 (override with ADDR).
- `make test`: validation, strict decoding, error responses and logging tests.

`NewHandler(logger)` is composed into the final application and, by default, the development host. `cmd/api` exposes the same handler independently. There is no database or real membership processing. Use test data: all accepted personal fields are logged.
