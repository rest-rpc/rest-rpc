---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Use `body(schema, contentType)` and `input(schema, contentType)` for every request body encoding, removing the form and multipart wrapper methods. Client calls select among multiple declared content types through the Fetch options argument. Server-first body calls always provide that option, while `request.jsonQuery()` remains available for structured query values.

Store every response declaration as `{ body, contentType?, headers? }`, using `body: undefined` for no-body responses. Remove the custom body wrapper types and `customStreamResponse()`; `streamResponse()` remains the NDJSON streaming API. Fetch clients parse and validate non-stream custom responses, with an optional `bodyParser` client setting for custom decoding.
