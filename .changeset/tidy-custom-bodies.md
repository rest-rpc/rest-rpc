---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Use `body(schema, { contentType })` and `input(schema, { contentType })` for every request body encoding, removing the form and multipart wrapper methods. An omitted body content type is normalized to `application/json`. Client calls select among multiple declared content types through the Fetch options argument. Server-first body calls always provide that option for non-JSON content types.

Replace `jsonQuery(schema)` with `query(schema, { serialization: "json" })`. Query schemas are no longer restricted by their inferred input shape. Server-first calls explicitly provide `querySerialization: "json"` through the Fetch options argument instead of wrapping values with `request.jsonQuery()`.

Declare responses with `response(status, schema?, options?)`, where content type and typed headers are options and an omitted schema means no body. Store every response declaration as `{ body, contentType, headers? }`, normalizing an omitted body content type to `application/json` and `streamResponse()` to `application/x-ndjson`; no-body responses use `body: undefined`. Remove the custom body wrapper types, `isStandardSchema()`, and `customStreamResponse()`. Fetch clients parse and validate non-stream custom responses, with an optional `bodyParser` client setting for custom decoding.
