# Signup API v1 (prototype)

Every experience talks to the same HTTP contract. The API has no experience-specific branches, captcha logic, UI schema, or dependency on frontend files.

## Request

`POST /api/signup` with `Content-Type: application/json`. One JSON object only, unknown properties rejected. Body limited to 16 KiB. No authentication. Same-origin browser clients use a local development proxy or the final combined server; no CORS configuration is needed.

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "ada@example.com",
  "street": "Testvej 42",
  "postalCode": "2200",
  "city": "København N",
  "birthDate": "10-12-1990",
  "phone": "+45 12345678",
  "membership": "ordinary",
  "message": "Optional message / PROSA member number"
}
```

All values are strings. All fields except message are required. Names/address/city/phone cannot be blank; the eight personal-information fields have a 256-byte server limit. Email must be a bare parseable address. Postal code is four ASCII digits. Birthdate must be a real non-future date in exactly dd-mm-yyyy format. Membership is ordinary or student. Message is optional and limited to 4000 bytes. Byte limits deliberately describe current server behaviour, not user-perceived character counts.

Irrelevant experience answers must not be added to this payload. New experiences reuse this contract, not another project's form code.

## Responses

- `200`: `{"message":"Modtaget! ..."}` — accepted and logged, and delivered to Slack when `SLACK_WEBHOOK_URL` is configured; **not** persisted in a database or processed as membership.
- `502`: `{"error":"Din tilmelding kunne ikke sendes. Prøv igen senere."}` — Slack delivery failed or timed out. The signup was still logged. Retrying may duplicate a Slack notification if Slack accepted a request whose response was lost.
- `422`: `{"error":"Kontrollér felterne.","fields":{"birthDate":"Brug en gyldig fødselsdato i formatet dd-mm-yyyy."}}`. Field keys match request properties. Experiences decide how to display/navigate to errors.
- `400`: `{"error":"..."}` for malformed, oversized, unknown-field or trailing JSON.
- `415`: `{"error":"Forventede JSON."}` for unsupported content type.
- `405`: method not allowed (standard Go response, not necessarily JSON).

API JSON responses use no-store caching. A caller must tolerate network errors and non-JSON infrastructure responses.

## Data handling

This API logs all valid submissions to stdout using structured JSON. If `SLACK_WEBHOOK_URL` is configured, it also posts all fields to Slack, synchronously with a five-second timeout. Without a webhook it remains log-only for development. Configure the secret at runtime, never in the frontend or image. Restrict log and Slack access and retention; use synthetic data until deployment data-handling decisions are made. No database, durable queue, email, rate limiting or real bot protection exists. The UI gates are jokes and do not secure the endpoint.
