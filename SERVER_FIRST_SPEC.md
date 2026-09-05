# Server-First API and General Adapters

## Goal

Add a framework-agnostic server-first API while preserving the existing
contract-first and framework-native APIs. this server is http only so it supports
http methods + sse. it does not support websockets.

```ts
// Server
export const routes = {
	create: route
		.post("/todos")
		.body(todoInput)
		.handler(async ({ body, context, signal }) => ({
			status: 201,
			body: await context.todos.create(body, { signal }),
		})),
};

// Client
const client = initClient<typeof routes>({ baseUrl });
const response = await client.post("/todos").fetchResponse({
	body: { title: "Write docs" },
});

if (response.status === 201) response.body.id;
```

The client supplies the method and path at runtime. `typeof routes` supplies
request and response types only. This provides server-first inference without a
runtime contract, generated client, procedure model, or RPC envelope.

## Adapter Boundary

There are two intentional adapter families:

- `@rest-rpc/fetch` and the proposed `@rest-rpc/node` are general catch-all
  dispatchers. They may support contract-first and server-first construction.
- Express, Fastify, Hono, and Nest preserve their frameworks' routing,
  middleware, context, lifecycle, and ecosystem. Their current contract-first
  `route()` and `router()` APIs do not need to change.

General adapters can be embedded in some frameworks at the cost of native
convenience. They do not replace the framework-specific adapters.

## Shared Implementation Construction

Every construction path produces the existing runtime shape:

```ts
type RouteImplementation = {
	route: RouteDeclaration;
	handler: RuntimeRouteHandler;
};
```

### Contract-first

`implement()` adds `.handler()` to a contract route or every leaf in a contract
tree:

```ts
const implementer = implement(contract);
// mirrors the contract tree and adds `.handler()` to every leaf
const create = implementer.todos.create.handler(createTodo);

// or attach a single handler to a single route
const get = implement(contract.todos.get).handler(getTodo);

const routes = {
	todos: { create, get },
};
```

### Server-first

The server `route` factory is the core contract builder plus a terminal
`.handler()` operation:

```ts
const create = route.post("/todos").body(todoInput).handler(createTodo);
```

The server package must extend, not reimplement, the core builder. Both forms of
`.handler()` use the same attachment primitive.

Implementation trees are ordinary objects used for organization and flattening:

```ts
export const routes = {
	todos: { create, get },
};
```

No new `router()` participates in this model. Framework adapters may retain
their existing routers.

`.$context<T>()` may select the arbitrary handler context. `signal` is a fixed
handler input supplied by the executing adapter and is not part of `T`.
Middleware and accumulated middleware context are post-POC work.

## Implicit Responses

Without a declared response, an HTTP handler returns an explicit envelope so
its status can be inferred:

```ts
return { status: 200, body: todo };
return { status: 404, body: { code: "NOT_FOUND" as const } };
return { status: 204 };
```

Response classification is deterministic:

| Shape                               | Kind            |
| ----------------------------------- | --------------- |
| SSE route                           | SSE             |
| No `body`                           | Empty           |
| `contentType` + async-iterable body | Custom stream   |
| `contentType` + other body          | Custom response |
| Async-iterable body                 | NDJSON stream   |
| Other body                          | JSON            |

`contentType` is envelope metadata:

```ts
return { status: 200, contentType: "text/csv", body: csv };
```

Existing response declaration methods remain available for runtime validation,
schema transforms, and detailed OpenAPI output. If one or more declared .response calls exist those are the source of truth for what handler can return. else, the inferred handler return
union remains the inferred type; variants sharing a status remain a union. If no response is declared, openapi output
will inherently not be possible to generate automatically,
and is not a goal nor blocker for this work.

## Server-First Fetch Client

The client proxy flattens `typeof routes` at the type level and selects a route
by the explicitly supplied method and path:

```ts
const client = initClient<typeof routes>({ baseUrl });

client.post("/todos").fetch({ body });
client.get("/todos/:id").fetchResponse({ params: { id } });
```

Invalid method/path combinations must fail type checking and valid paths should
autocomplete. Specialized request encodings that cannot be inferred at runtime,
such as JSON-encoded queries, use a small explicit request DSL that bridges to
the existing Fetch client implementation.

For inferred responses, the server sends a lightweight response-kind header so
the client can choose empty, JSON, NDJSON, custom, custom-stream, or SSE handling.
The body remains ordinary HTTP content. Contract-first clients continue using
their runtime contract and do not need this header.

The header is always present for server-first clients, even if the response is declared or the route
came from contract first. on client side for type only client or malformed header throws a runtime error. the header is ignored if the client already has the runtime contract.

```bash
X-Rest-Rpc-Response-Kind: v=1 kind=json
```

## Node Adapter

Add `@rest-rpc/node` as a separate catch-all adapter for `node:http`. It is a
transport bridge, not an HTTP framework.

It owns matching, request translation, abort-signal lifecycle, response writing,
stream backpressure, iterator cancellation, and leaving unmatched requests
untouched. The caller supplies application context and may explicitly include
`req` or `res`; they are not automatically exposed to handlers.

It does not own authentication, CORS, compression, rate limits, timeouts,
multipart policy, body-size policy, or framework middleware. Callers may
preprocess requests before invoking it. The exact body-supply hook is deferred to
the Node-adapter POC.

Implementing http requst handling and response handling is
technically straightforward, but needs solid integration test coverage to ensure that the adapter is good enough to be used in a
real application and avoids any common pitfalls on working
with low-level Node HTTP APIs. The adapter should be tested with a variety of
request types, including streaming requests, large payloads, and error scenarios.

Node adapter mirros the fetch adapter API for the server integration:

```ts
const routeHandler = createRouteHandler(routes);

const server = createServer(async (req, res) => {
	const { matched } = await routeHandler(req, res);
	if (!matched) {
		res.statusCode = 404;
		res.end();
	}
	// response is already written here by the routeHandler if it matched
});
```

## Work Order

Type feasibility is the go/no-go risk. Prove types before runtime work.
If types don't work, there is no point in continuing. The work order is:

1. **Shared builder types:** prove `implement(route)`, `implement(contract)`, the
   extended core route builder, and ordinary-object composition.
2. **Implicit response inference:** prove every response kind, async handlers and
   generators, multiple statuses, same-status unions, and literal preservation.
3. **Server-first client types:** prove method/path selection, request inputs,
   specialized encodings, response narrowing, and stream types.
4. **Type quality:** verify `tsd`, hover readability, emitted declarations,
   TS2883 coverage, and downstream checker cost. Redesign or stop if this fails.
5. **Shared runtime:** implement handler attachment, contract traversal, core
   builder extension, and inferred response normalization.
6. **Client runtime:** implement the proxy by reusing the existing Fetch client,
   then add response-kind metadata.
7. **Node adapter:** implement and integration-test the thin catch-all adapter.
8. **Post-POC:** consider middleware, accumulated context, short-circuit helpers,
   and other conveniences only after the vertical slice succeeds.

## Non-goals

- Redesigning framework-specific adapters.
- Adding procedures or a separate RPC execution model.
- Sending response envelopes over HTTP.
- Publishing or generating a runtime contract for server-first clients.
- Making rest-rpc responsible for general server-framework behavior. In the node adapter case, it must be good enough to be trusted but does not need to abstract everything from the user if they
  explicitly choose to use the node http server directly instead of a framework giving them access to the request and response objects. The adapter should be a thin layer that allows users to use the rest-rpc framework without having to worry about the underlying HTTP implementation details for
  routes rest-rpc is handling.
