---
"@rest-rpc/core": minor
"@rest-rpc/express": minor
"@rest-rpc/fastify": minor
"@rest-rpc/fetch": minor
"@rest-rpc/hono": minor
"@rest-rpc/nest": minor
"@rest-rpc/next": minor
"@rest-rpc/server": minor
"@rest-rpc/tanstack-query": minor
---

This redesign replaces the object-shaped contract syntax with a fluent route builder while standardizing several inconsistent parts of the contract model. The new API reduces type complexity and removes choices that did not provide meaningful value.
Request locations now accept whole-object schemas, allowing schema input/output generics to document transport and handler behavior directly. Response statuses are always explicit rather than inferred from HTTP methods. WebSocket messages consistently use a single { type, message } envelope instead of supporting multiple competing declaration and encoding models.
Together, these changes make contract declarations easier to discover through autocomplete, easier to understand without prior knowledge of the API, and simpler for TypeScript to infer.
