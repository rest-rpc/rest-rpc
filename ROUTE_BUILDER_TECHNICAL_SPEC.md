# Route-First Contract DSL Technical Spec

Status: temporary implementation plan for the beta contract rewrite.

## 1. Summary

Replace the core contract-level `router()` declaration model with a route-first builder DSL:

```ts
const apiRoute = route.with({
	pathPrefix: "/api",
	headers: { authorization: AuthHeader },
	responses: { 401: Unauthorized },
	metadata: { auth: true },
});

export const api = {
	todos: {
		list: apiRoute.get("/todos").response(200, TodoList),
		create: apiRoute.post("/todos").body(TodoInput).response(201, Todo),
	},
};
```

A route is the semantic contract unit. Plain object trees only organize the generated client, helper, and handler shapes.

The rewrite intentionally does not preserve the old contract declaration model during implementation. Intermediate commits may not compile. The completed PR must pass the normal workspace checks.

## 2. Goals

- Make route declarations autocomplete-friendly and locally understandable.
- Preserve HTTP method, path, request segments, response statuses, metadata, and OpenAPI data as explicit concepts.
- Replace recursive tree-wide option application with per-route factory defaults.
- Preserve literal paths, response statuses, metadata, and other useful literals where practical.
- Make route setter order irrelevant after selecting a method or protocol.
- Keep the type problem local to one route instead of recursively transforming a contract tree.
- Preserve plain inline route declarations as an advanced escape hatch.
- Let existing contract consumers traverse ordinary object trees without a contract finalization phase.

## 3. Non-goals

- No fluent contract tree or router builder.
- No callback form for `route.with()`.
- No stacked `.with()` calls in the initial design.
- No arbitrary stacking of route setters.
- No server API redesign.
- No changes to the public Express, Hono, Fastify, Nest, Fetch, or Next implementation-building models beyond adapting their internal route-field access.
- No new server implementation builder.
- No hidden procedure transport or custom wire protocol.
- No compatibility layer that keeps both old and new contract declaration models alive internally.

## 4. Public Contract DSL

### 4.1 Route factories

```ts
route.get(path);
route.post(path);
route.put(path);
route.patch(path);
route.delete(path);
route.sse(path);
route.ws(path);
route.with(options);
```

Selecting a method or protocol must happen first. After that, compatible setters may be called in any order.

### 4.2 HTTP setters

```ts
.body(schema)
.formBody(schemaOrOptions)
.multipartBody(schemaOrOptions)
.customBody(schemaOrOptions)
.query(schema)
.jsonQuery(schema)
.pathParams(schema)
.headers(schemas)
.requestKeys(map)
.flattenRequestKeys(boolean)
.response(status, schema?)
.customResponse(status, { contentType, schema })
.streamResponse(status, schema)
.customStreamResponse(status, { contentType, schema })
.metadata(value)
.openApi(value)
```

### 4.3 SSE setters

```ts
.query(schema)
.jsonQuery(schema)
.pathParams(schema)
.requestKeys(map)
.flattenRequestKeys(boolean)
.response(schema)
.metadata(value)
.openApi(value)
```

SSE does not expose `.body()` or `.headers()`.

### 4.4 WebSocket setters

```ts
.query(schema)
.jsonQuery(schema)
.pathParams(schema)
.requestKeys(map)
.flattenRequestKeys(boolean)
.clientMessages(schema)
.serverMessages(schema)
.metadata(value)
.openApi(value)
```

WebSocket does not expose `.body()`, `.headers()`, `.response()`, or `.responses()`.

## 5. Canonical Route Representation

Builder methods and declaration data must not compete for the same property names. Request declaration data is nested under `request`:

```ts
type BaseRouteDeclaration = {
	method: HttpMethod;
	path: string;
	mode?: "http" | "sse" | "webSocket";
	request?: {
		body?: RequestBodySchema;
		query?: StandardSchemaV1 | JsonQuery;
		pathParams?: StandardSchemaV1;
		headers?: RequestSchemaRecord;
		keys?: RequestKeys;
		flattenKeys?: boolean;
	};
	metadata?: RouteMetadata;
	openApi?: OpenApiRouteOptions;
};
```

The exact exported type names may differ, but the nested request model is intentional:

```ts
route.body; // builder method
route.request.body; // declaration data

route.headers; // builder method
route.request.headers; // declaration data
```

HTTP routes additionally expose a canonical response map:

```ts
type HttpRouteDeclaration = BaseRouteDeclaration & {
	mode?: "http";
	responses: RouteResponses;
};
```

HTTP routes must declare at least one response locally or inherit a common response from their configured factory. Calling `.response(status)` declares an empty response body; supplying the schema argument declares a regular Standard Schema response or the regular schema-plus-headers form. Specialized response helpers are not accepted by `.response()`. Local statuses override duplicate common statuses.

Each specialized request or response representation has one builder method. `.formBody()`, `.multipartBody()`, `.customBody()`, and `.jsonQuery()` construct the existing canonical helper representation internally. `.customResponse()`, `.streamResponse()`, and `.customStreamResponse()` do the same for responses. Custom response methods use an object argument consistent with custom request bodies:

```ts
route.get("/report").customResponse(200, {
	contentType: "text/csv",
	schema: Csv,
});
```

Regular `.body()` accepts only a Standard Schema. Regular `.query()` and `.pathParams()` likewise accept only Standard Schemas. Schema records remain available only for headers because common and local headers must merge by header name. Users of opaque Standard Schema implementations provide explicit key ownership through `.requestKeys()`.

SSE routes expose their required event schema in one canonical field selected during implementation. The public `.response(schema)` setter is single-write and must produce the representation expected by SSE client and server inference.

WebSocket routes expose:

```ts
messages: {
	client: WebSocketMessageDeclaration;
	server: WebSocketMessageDeclaration;
}
```

Builder methods should live on prototypes or otherwise remain non-enumerable. Declaration data should be ordinary inspectable data. No WeakMap-backed declaration storage or broad finalization mechanism is required.

## 6. Contract Shape and Traversal

The contract remains recursive only as an organizational type:

```ts
type Contract = RouteDeclaration | { [key: string]: Contract };
```

Existing traversal already derives the organizational path:

```ts
for (const { route, path } of contractRouteEntries(contract)) {
	// path is the generated API location, for example ["todos", "create"]
}
```

Consumers must use traversal context rather than writing `routePath` onto route declarations. `mapContractRoutes()` already passes the path to its mapping callback.

The same route may therefore appear in multiple trees without mutation or stale tree-path metadata.

## 7. `route.with()` Defaults

`route.with(options)` returns a configured route factory:

```ts
const apiRoute = route.with({
	pathPrefix: "/api",
	headers: { authorization: AuthHeader },
	responses: { 401: Unauthorized },
	metadata: { auth: true },
	openApi: { tags: ["Todos"] },
	flattenRequestKeys: true,
});
```

Calling `get()`, `post()`, `sse()`, or `ws()` eagerly applies all compatible defaults to a fresh route declaration. No recursive walk is needed to apply common options.

Merge rules:

- `pathPrefix` concatenates literally with the route-local path and preserves the resulting literal type. The builder does not repair missing or duplicate separators.
- Common HTTP headers are copied into `request.headers`; local keys override common duplicate keys.
- Common HTTP responses are copied into the response map; local statuses override common duplicate statuses.
- Metadata shallow-merges; local keys override common duplicate keys.
- OpenAPI data follows the established merge behavior, including tag union and nested response/header merging where currently supported.
- `flattenRequestKeys` is the route-local value when explicitly set and otherwise the factory default.
- Factory option objects and nested values must not be mutated or shared mutably across routes.

HTTP headers and HTTP responses apply only to ordinary HTTP routes. SSE and WebSocket factories apply only protocol-compatible common options such as path prefix, metadata, OpenAPI data, and flattening behavior.

The configured factory does not expose another `.with()` initially. Users compose uncommon multi-level defaults with ordinary object composition. Stacked `.with()` can be considered later only if real usage demonstrates meaningful value.

## 8. Setter Semantics

Most setters are single-write:

```ts
route.post("/todos").body(A).body(B); // type error; runtime error if bypassed
```

Single-write slots:

- request body: `body`, `formBody`, `multipartBody`, or `customBody`
- query: `query` or `jsonQuery`
- `pathParams`
- `headers`
- `requestKeys`
- `flattenRequestKeys`
- `metadata`
- `openApi`
- SSE `response`
- WebSocket message direction setters

HTTP response methods are naturally additive across distinct statuses. All response methods share one local-status registry:

```ts
route
	.post("/todos")
	.response(201, Todo)
	.response(400, ValidationError)
	.response(409, Conflict);
```

Repeating the same literal status is a type error and a runtime error when types are bypassed.

Every HTTP response status is explicit. `.response(status)` uses the existing `noBody()` representation, while `.response(status, schema)` records the supplied response declaration. Either form may be followed by additional distinct statuses.

The builder never accepts the `noBody()` sentinel: absence of a request body means no body, and `.response(status)` means an empty response body. The sentinel remains only in the produced canonical declaration where a response-map value is required.

Regular builder methods do not accept specialized helper values. Use `.formBody()`, `.multipartBody()`, `.customBody()`, `.jsonQuery()`, `.customResponse()`, `.streamResponse()`, or `.customStreamResponse()` directly. Standalone helpers remain available for canonical inline declarations.

Response maps remain part of the canonical inline declaration format. Every builder response method writes exactly one `status -> declaration` entry. The numeric status remains the sole response discriminator for client types and runtime handling. Two route-local declarations may not use the same status, regardless of response kind. A route-local declaration may replace a common response at the same status because common statuses do not consume the local used-status typestate.

Advanced composition belongs in the supplied values:

```ts
.headers({ ...authHeaders, ...traceHeaders })
.body(composedBodySchema)
.metadata({ ...baseMetadata, permission: "todos:create" })
```

The builder is a route declaration language, not a general-purpose merging API.

## 9. Order Independence

After selecting the method or protocol, independent setters may appear in any order:

```ts
route.post("/todos").body(TodoInput).headers(AuthHeaders).response(201, Todo);
```

must describe the same route as:

```ts
route.post("/todos").response(201, Todo).headers(AuthHeaders).body(TodoInput);
```

The type system tracks which setters remain available, not a sequence of phases.

## 10. Request-Key Resolution

Request-key resolution is local to a route and does not require contract finalization.

Each request setter stores its schema and attempts to resolve its own segment:

```ts
.body(BodySchema)           // resolves body keys when supported
.query(QuerySchema)         // resolves query keys when supported
.pathParams(PathSchema)     // resolves path parameter keys when supported
.headers(HeaderSchemas)     // header keys are already explicit
```

The built-in Zod, ArkType, and Valibot resolvers infer property keys from Standard Schemas. There is no alternative record-of-field-schemas form for body, query, or path parameters. `.requestKeys()` supplies explicit mappings for opaque schemas.

The effective mapping is stored under `request.keys`:

```ts
request: {
	body: TodoInput,
	query: TodoQuery,
	keys: {
		title: "body",
		includeDone: "query",
	},
}
```

`.requestKeys(map)` supplies explicit information for opaque schemas. It must work before or after schema setters. The route implementation may recompute the effective mapping after each relevant setter to guarantee order independence.

Local validation detects:

- Duplicate keys across request segments.
- Explicit mappings that contradict automatically known mappings.
- Keys referring to undeclared request segments.
- Path parameters missing matching path keys.
- Path keys absent from the route path.
- Reserved request or header keys.

If a schema is opaque, its setter may leave key resolution incomplete so that `.requestKeys()` can be called later. Consumer validation reports unresolved keys only if flattening remains enabled.

When `flattenRequestKeys(false)` is selected, property-level resolution is unnecessary for opaque grouped segments.

## 11. Validation Without Finalization

The builder eagerly creates the canonical route shape and applies defaults. Consumers need validation, not a tree-wide normalization pass.

Validation checks:

- Route completeness.
- Protocol-compatible fields.
- Request-key resolution and collisions.
- Path parameter consistency.
- Response presence and response declaration validity.
- Reserved headers and content types.
- SSE response presence.
- WebSocket client and server message presence.

Validation should not mutate the contract.

Incomplete SSE and WebSocket builders are not assignable to `Contract` at the TypeScript level:

```ts
route.sse("/events"); // builder, not a complete route leaf
route.sse("/events").response(Event); // complete

route.ws("/socket").clientMessages(Client); // incomplete
route.ws("/socket").clientMessages(Client).serverMessages(Server); // complete
```

Runtime validation still protects JavaScript users and callers that bypass TypeScript.

## 12. Inline Declarations

Plain inline route objects remain supported:

```ts
const api = {
	todos: {
		create: {
			method: "POST",
			path: "/todos",
			request: {
				body: TodoInput,
			},
			responses: {
				201: Todo,
			},
		},
	},
};
```

Inline declarations are an advanced escape hatch and interoperability format. Their manual ergonomics must not dictate the builder or canonical representation.

The canonical inline shape must be documented and validated. The normal documentation path should use the builder DSL.

## 13. TypeScript Design

The builder replaces recursive tree normalization with local route typestate.

Each builder tracks approximately:

- Exact method.
- Exact local and prefixed path.
- Request segment schemas.
- Effective request keys and flattening mode.
- Response status map.
- Exact metadata and OpenAPI values where useful.
- Remaining single-write setters.
- SSE or WebSocket completion state.

The containing API object uses ordinary TypeScript object inference. No type walks the full tree merely to apply options.

Important type guarantees:

- `route.with({ pathPrefix: "/api" }).get("/todos").path` preserves `"/api/todos"` where practical.
- Common and local metadata preserve useful literal values rather than immediately widening to `Record<string, unknown>`.
- Response status keys remain numeric literals.
- Calling a single-write setter removes that setter from the returned type.
- Independent remaining setters continue to autocomplete in any order.
- Duplicate literal response statuses are rejected.
- Only complete protocol builders satisfy `RouteDeclaration` and `Contract`.

Do not normalize path strings. Literal concatenation and shallow local merges are preferred.

## 14. Server Scope

Server public APIs remain as they are conceptually:

- Express, Hono, and Fastify continue using their existing `router(api, handlers)` and `registerRoutes(...)` flow.
- Nest continues using its decorators, `RouteHandlers`, `RouteRequest`, and server `router()` integration.
- Fetch and Next retain their runtime router builders because they provide middleware/context behavior missing from the host runtime.

The core contract `router()` and server/runtime `router()` functions have different responsibilities. Only the core contract declaration `router()` is displaced by this feature.

Server packages only require mechanical internal migration from flat route request fields to the new canonical nested request fields.

## 15. Implementation Strategy

This work should be implemented as one demolition-first PR. Intermediate commits are not required to compile. Do not add temporary compatibility layers solely to keep each commit green.

Before starting, record the existing type-check benchmark results for comparison.

### Commit 1: Replace the core declaration model

- Rewrite the canonical HTTP, SSE, WebSocket, route, and contract types.
- Introduce the nested `request` representation.
- Remove `routePath` from semantic route declarations.
- Remove recursive `ApplyRouterOptions` and related tree-wide merge types.
- Remove the core contract `router()` declaration API.
- Remove or disconnect the old normalization implementation.
- Leave downstream compile errors visible as the migration checklist.

Expected state: the workspace does not compile.

### Commit 2: Implement the HTTP route factory and runtime builder

- Add `route.get/post/put/patch/delete`.
- Add the HTTP setters.
- Add dedicated form, multipart, custom, JSON-query, and streaming declaration setters.
- Add `route.with(options)` as a single-level configured factory.
- Eagerly apply compatible defaults at method/path construction.
- Implement local-over-common merge rules.
- Ensure every route receives independent nested objects.
- Implement single-write runtime checks.
- Implement distinct-status response stacking.
- Keep builder methods non-enumerable and declaration data inspectable.
- Add focused runtime unit tests independent of downstream packages.

Expected state: core builder runtime tests pass; workspace may still not compile.

### Commit 3: Add local HTTP builder typing

- Preserve method, prefixed path, status, metadata, and schema literals.
- Track remaining setters without ordered phases.
- Model all request body methods as one single-write slot and both query methods as one single-write slot.
- Remove single-write setters after use.
- Track distinct response statuses across every response method while permitting local overrides of common statuses.
- Make completed HTTP builders assignable to `HttpRouteDeclaration`.
- Add `tsd` coverage and hover fixtures for representative routes.
- Avoid any recursive transformation over the containing contract tree.

Expected state: HTTP builder type tests pass; downstream packages may still fail.

### Commit 4: Add SSE and WebSocket builders

- Implement protocol-specific runtime setters.
- Expose both `.query()` and `.jsonQuery()` as one protocol query slot.
- Exclude incompatible setters from each builder surface.
- Model incomplete and complete protocol typestates.
- Require the canonical `.clientMessages()` then `.serverMessages()` declaration style, in either order.
- Add runtime completeness validation.
- Add protocol-specific runtime cases to the route unit suite and type cases to the consolidated route-builder `tsd` suite.

Expected state: all core builder variants work in isolation.

### Commit 5: Migrate request inference, request construction, and validation

- Update client/server request inference to read nested request fields.
- Resolve request keys incrementally from request setters.
- Support explicit `.requestKeys()` in either setter order.
- Preserve grouped request behavior when flattening is disabled.
- Rewrite validation as non-mutating route validation.
- Remove messages and branches that instruct users to call core `router()`.
- Update request and body unit/type tests.

Expected state: core request behavior compiles and passes tests.

### Commit 6: Migrate responses, client, OpenAPI, and TanStack Query

- Update response inference for the canonical route shape.
- Update `initClient()` and request execution.
- Continue using `mapContractRoutes()` without annotating routes.
- Update OpenAPI to consume `{ route, path }` directly from traversal.
- Remove dependence on stored `routePath`.
- Update TanStack Query helpers to use the shared traversal path where suitable.
- Add builder-declared client, OpenAPI, and TanStack Query tests.

Expected state: core and TanStack Query compile and pass relevant tests.

### Commit 7: Migrate server internals without redesigning server APIs

- Update shared server request and response handling for nested request fields.
- Update Express, Hono, Fastify, Nest, Fetch, and Next internal route access.
- Preserve each package's existing public server workflow.
- Preserve Fetch/Next middleware and handler builder behavior.
- Update adapter unit tests as necessary.

Expected state: all packages compile; integration fixtures may still use the old contract syntax.

### Commit 8: Replace contract fixtures and integration declarations

- Rewrite integration contracts using the builder-first DSL.
- Keep a focused set of inline declaration tests for the advanced escape hatch.
- Keep one consolidated route-builder `tsd` suite for HTTP, SSE, and WebSocket local errors and hover quality.
- Keep client inference in the separate client `tsd` suite; remove legacy tests for the old contract declaration and recursive flattening APIs.
- Remove tests that exist only for old core `router()` normalization behavior.
- Run unit and integration suites and fix behavioral regressions.

Expected state: workspace typecheck and tests pass.

### Commit 9: Update benchmarks and documentation

- Rewrite generated benchmark fixtures to use `route` and `route.with()`.
- Compare old recorded results with builder declarations at the existing route counts.
- Include cases for defaults, literal paths, and literal metadata.
- Rewrite `content/docs/` contract declaration documentation.
- Make builder declarations the primary documented path.
- Document the canonical inline format as an advanced option.
- Document that server public APIs are unchanged.
- Add migration notes appropriate for the beta release.

Expected state: the complete repository check passes and performance results are recorded.

## 16. Test Matrix

Runtime coverage:

- Every method and protocol constructor.
- Every compatible setter.
- Protocol-incompatible method absence and runtime validation.
- Eager default application.
- Local-over-common merges.
- Setter order independence.
- Duplicate single-write rejection.
- Duplicate response-status rejection.
- Factory and route isolation.
- Incremental and explicit request-key resolution.
- Opaque schemas with flattened and grouped requests.
- Plain inline and mixed inline/builder trees.
- Reuse of one route in multiple organizational trees.

Type coverage:

- Literal method and joined path preservation.
- Metadata literal preservation.
- Response status accumulation.
- Setter removal after single writes.
- Autocomplete availability in arbitrary setter order.
- Incomplete SSE and WebSocket rejection.
- Complete builder assignability to canonical declarations.
- Client request and response inference.
- Server handler inference through unchanged server APIs.

Integration coverage:

- Real HTTP requests across every adapter.
- SSE and WebSocket behavior.
- OpenAPI route paths and operation identity from traversal context.
- TanStack Query helper tree shape.
- Fetch/Next runtime middleware context accumulation.

## 17. Completion Criteria

- Core contract declarations use the builder-first model.
- Core contract `router()` and recursive option-application types are removed.
- `route.with()` applies defaults locally without walking the contract tree.
- No broad contract finalizer mutates or annotates the tree.
- Request keys resolve locally or validate as explicitly supplied.
- Existing traversal provides all organizational path information.
- Inline declarations use the canonical documented representation.
- Server public APIs retain their existing framework-appropriate shapes.
- Literal-path and metadata precision are covered by hover/type tests.
- Type-check benchmarks show the cost of the new model relative to the recorded baseline.
- `pnpm run check` succeeds on the completed PR.
