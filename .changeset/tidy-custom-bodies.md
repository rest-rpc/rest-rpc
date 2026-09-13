---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Declare custom request bodies with `body(schema, contentType)` and custom responses with `response(status, { body, contentType })`, removing the separate `customBody()` and `customResponse()` methods. Content type selection uses a separate top-level `contentType` field on client requests, server handler requests, and server response envelopes. Fetch clients now parse and validate non-stream custom responses, with an optional `bodyParser` client setting for custom decoding, while `customStreamResponse()` continues to return the native `Response`.
