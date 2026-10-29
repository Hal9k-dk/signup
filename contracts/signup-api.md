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

- `200`: `{"message":"Modtaget! ..."}` — accepted and logged; **not** persisted or processed as membership.
- `422`: `{"error":"Kontrollér felterne.","fields":{"birthDate":"Brug en gyldig fødselsdato i formatet dd-mm-yyyy."}}`. Field keys match request properties. Experiences decide how to display/navigate to errors.
- `400`: `{"error":"..."}` for malformed, oversized, unknown-field or trailing JSON.
- `415`: `{"error":"Forventede JSON."}` for unsupported content type.
- `405`: method not allowed (standard Go response, not necessarily JSON).

API JSON responses use no-store caching. A caller must tolerate network errors and non-JSON infrastructure responses.

## Data handling

This development API logs all accepted fields to stdout using structured JSON. Use synthetic data only. No database, email, rate limiting or real bot protection exists. The UI gates are jokes and do not secure the endpoint.
