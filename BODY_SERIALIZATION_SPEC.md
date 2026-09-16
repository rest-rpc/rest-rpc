# Body serialization and parsing spec

Status: the user approved implementation of the shared codec subpath and Fetch
client wiring only, as two separate commits. Server work remains deferred for
review. Examples describe the target API, including server options that do not
exist yet.

This document records the intended body behavior before implementation. It covers
ordinary HTTP request and response bodies. Declared NDJSON responses keep their
existing streaming path and do not participate in this codec system.

## Purpose and invariants

- The route's declared media type selects outgoing serialization. The received
  `Content-Type` header selects incoming deserialization. A declaration can also
  constrain which incoming media types a route accepts; it is not a substitute
  for the received header.
- A server checks the received request media type against a route's declared
  request types when a body is declared. A contract-first client can check a
  received response type against response types retained in its runtime
  contract. A server-first generated client cannot make that check because its
  generated contract does not retain allowed response media types; it parses
  from the received header instead. Transport checks are distinct from schema
  validation.
- Codecs match media types, not JavaScript value classes. A nested `File`, `Date`,
  or other rich value does not silently switch the request to a different wire
  format. Users may define such a protocol explicitly with custom codecs and
  declared media types.
- There is no top-level echo of an incoming `contentType` on handler requests or
  client responses. Raw headers remain available through the native adapter
  request fields and the client's `response.headers`. Typed, declared request
  and response headers remain separate from raw headers.
- Ordinary built-in deserialization buffers the complete body before route
  validation. The library does not officially support streaming through this
  codec path. Custom codecs may use streams at their own discretion. Declared
  NDJSON responses remain an independently supported streaming feature.
- Client parsing has no built-in body-size limit. Raw server request parsing has
  a documented finite default byte limit. Users may change that limit while
  using the built-in deserializer, or provide a custom deserializer that owns
  its own size policy.
- Parsing and serialization are independent operations. An override for one
  operation does not replace the default for the other.

## Plain built-in body behavior

The built-in codecs use broad, ordered media-type matchers. They perform only
the ordinary encoding or decoding operation for the selected type. The
outgoing column describes the built-in value/encoding, not a guarantee that
that value can be passed directly to every native writer. Adapters prepare
built-in results for their transport:

| Media type                                      | Outgoing body     | Incoming value    |
| ----------------------------------------------- | ----------------- | ----------------- |
| JSON, including `application/json` and `*+json` | JSON text         | Parsed JSON value |
| `application/x-www-form-urlencoded`             | `URLSearchParams` | `URLSearchParams` |
| `multipart/form-data`                           | `FormData`        | `FormData`        |
| `text/*`                                        | String            | String            |
| Other ordinary binary types                     | `Blob`            | `Blob`            |

The form defaults do not construct forms from plain objects or convert parsed
forms into objects. Schemas or user codecs may perform those transformations.
The binary default does not infer a format from a value. File names and other
metadata stay in multipart `File` values or in HTTP headers such as
`Content-Disposition`.

## Codec matching and callback contract

The codec configuration is an ordered array of rules. Each rule has a matcher
and may provide `serialize`, `deserialize`, or both. Resolution loops over user
rules first, in user order, and then over library defaults. It selects the first
matching rule **for each operation independently**. A single user rule with
`match: () => true` can replace either or both operations globally. A rule
matching `image/*` or `application/*+json` needs no static media-type registry.

Matching uses the normalized base media type so parameters do not interfere
with exact string matches such as `mediaType === "application/json"`.
Deserializers receive the entry point's native source and read its complete
headers, including parameters, using that source's API. Matching does not
consume or convert the source. Node passes `IncomingMessage` to a matching
custom deserializer and bridges to Fetch only for built-in fallback parsing.
Users can perform their own Fetch normalization when they want portable codecs;
the library must not preclude native parsers by converting custom inputs first.

A serializer receives the value to send and returns the wire body. It may also
return untyped HTTP headers derived from that value and a `contentType`
directive:

- Omitted `contentType` uses the selected declared media type.
- A string sets that exact outgoing header, including any parameters.
- `null` instructs the adapter not to set a static header and to let the
  transport runtime generate the correct one, such as a multipart boundary.

`contentType: null` suppresses the static header; header generation then depends
on the selected native transport, not a universal Fetch conversion. Custom Node
serializers must supply an explicit parameterized `contentType` when their
encoded body requires a boundary that Node cannot generate. Built-in multipart
serialization includes adapter-specific encoding and boundary generation.
`Content-Type` is controlled through the dedicated directive rather than through
generic codec headers. Codec headers remain outside the typed response-header
contract and are available to the client as raw `response.headers`. Declared
response headers continue through their existing schema validation. Header
precedence and reserved headers are specified below.

Codec matching and route acceptance are separate checks. A codec rule may
handle all `image/*` bodies without implying that every route accepts every
image subtype. Wildcard route declarations, if desired, are a separate contract
decision.

## Default ownership by entry point

"rest-rpc" in this table means the direction uses the shared codec. "Framework"
means rest-rpc passes through the value supplied to or produced by that
framework without applying a codec or a body coercion.

| Entry point          | Incoming body                      | Outgoing body                 | Default behavior and opt-in                                                                                                                               |
| -------------------- | ---------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch client         | rest-rpc deserializes responses    | rest-rpc serializes requests  | Both directions use the shared codec. Ordinary responses have no built-in size limit.                                                                     |
| Fetch server handler | rest-rpc parses requests           | rest-rpc serializes responses | Raw request parsing uses the server byte limit.                                                                                                           |
| Node server handler  | rest-rpc parses requests via Fetch | rest-rpc serializes responses | Custom parsing receives `IncomingMessage`; only built-in fallback bridges to Fetch. Native response delivery is owned by Node.                            |
| Hono registration    | rest-rpc parses requests via Fetch | rest-rpc serializes responses | The current Fetch-native body path is the default.                                                                                                        |
| Express registration | Express parses requests            | rest-rpc serializes responses | `req.body` is used by default. Raw-body opt-in uses the shared parser; the user must ensure no Express parser consumed the stream first.                  |
| Fastify registration | Fastify parses requests            | Fastify serializes responses  | `req.body` and the framework's ordinary response path are used by default. Request and response directions can opt into rest-rpc ownership independently. |
| Nest adapter         | Nest parses requests               | Nest serializes responses     | Nest's parsed body and ordinary response path are used by default. Request and response directions can opt into rest-rpc ownership independently.         |

When a framework owns parsing, the value it produces goes straight to route
validation. rest-rpc does not deserialize it again. When a framework owns
serialization, rest-rpc validates the handler result and supplies status and
declared headers, but it does not stringify or encode the body first. Framework
users configure native parsers and serializers for the body types they use.

Opting into rest-rpc request parsing tells a framework adapter to read the
**unconsumed** body and run the selected deserializer with its native source.
Only built-in fallback parsing uses the adapter's Fetch bridge. The raw source must be available
unconsumed. The adapter must fail
clearly if the body was already consumed; it must not silently reuse a parsed
`req.body`. Opting into rest-rpc response serialization lets a codec prepare
the body, after which the adapter writes the result through a framework API
that will not serialize it again. These two ownership choices are independent.

The present Fastify and Nest writers partly delegate JSON to the framework but
coerce custom responses into strings or byte wrappers. The new boundary should
remove those implicit custom-body conversions when the framework owns the
response, and use the shared codec when rest-rpc owns it. Express already uses
the Node response writer, so it is primarily an input-parsing exception.

## Server request-size ownership

The server limit belongs to the component that reads the body, not to the
codec rule itself. Fetch enforces the raw request limit while its built-in
deserializer reads; Node delegates to that same path. A counting stream can
reject as soon as received bytes exceed the limit, without a separate full
read. `Content-Length` may allow an early rejection but cannot replace byte
counting. The oversized-body result is HTTP `413`.

The limit applies to a request resolved to a library-owned default
`deserialize` operation. A matching user `deserialize` override owns its own
limit and does not inherit a library guarantee. A user-configured limit and a
user `deserialize` override should be mutually exclusive in configuration;
serialize-only overrides remain compatible with the built-in deserializer and
its limit. If a user override matches only some media types, unmatched types
continue through the default deserializer and its default limit.

Framework-owned parsers own their own size limits by default. A framework
adapter using the raw-body opt-in follows the same rest-rpc limit-or-custom-
deserializer rule as Fetch and Node. The client stays unbounded by default;
client users may enforce a response limit in their own deserializer.

## Shared implementation boundary

- `@rest-rpc/core/codecs` owns normalized matching, ordered operation resolution,
  generic codec types, and shared built-in format behavior. The Fetch client
  uses Fetch reading and delivery there; core does not depend on server adapters
  or require custom server codecs to use Fetch sources or outputs.
- `@rest-rpc/fetch` owns bounded built-in raw request reading and Fetch response
  delivery. `@rest-rpc/node` passes native requests to custom deserializers and
  constructs a Fetch bridge only after resolving to built-in parsing.
- `@rest-rpc/server` keeps route/schema validation and logical result
  normalization. Its current `sendJson` / `sendCustom` writer callback model
  should separate codec selection, encoding, framework delegation, and native
  delivery. Empty bodies and NDJSON retain their own paths.
- Each adapter owns native input and output APIs. Custom serializer results go
  directly to native delivery, without implicit JSON encoding, stringification,
  or conversion through Fetch. Node writes strings/buffers through its native
  writer and pipes native readable streams as appropriate. Native transport
  failures propagate; no separate rest-rpc body-compatibility registry or
  value-coercion step is introduced for custom outputs.
- Built-in serializers need adapter-specific preparation. For example, Node
  encodes a built-in `FormData` body with a generated multipart boundary and
  bridges its bytes/stream and headers to native delivery. Built-in Blob and
  URLSearchParams outputs also need native preparation. These bridges may reuse
  Fetch machinery, but do not apply implicitly to matching custom serializers.

## Documentation changes

A focused documentation page should state the default values above, explain
matcher order and partial overrides, show how to replace either direction,
and state buffering and size-limit ownership. Existing scattered form,
multipart, custom-body, and parser notes in `content/docs/` should link to that
page rather than repeat competing transport rules. Adapter pages should state
their default request source and response mode. Framework parser configuration
and disabling automatic response handling are outside this spec's scope.

## Target public API

These names and signatures are the proposal to approve before implementation.
Existing entry-point arguments and unrelated options remain as they are.
Configuration is per client or adapter registration, not per route or per call.
Routes continue to declare schemas and concrete media types using `.body()`,
`.input()`, `.response()`, and `.output()`; codecs are runtime configuration and
are not embedded in contracts or generated client declarations.

### Shared codec types (`@rest-rpc/core` root exports)

```ts
/** Body prepared by a codec for delivery through the destination transport. */
export type SerializedBody = {
	body: unknown;
	headers?: Record<string, string | number | undefined>;
	contentType?: string | null;
};

/** Encodes a validated outgoing value for the selected declared media type. */
export type BodySerializer = (
	value: unknown,
	declaredContentType: string,
) => SerializedBody | Promise<SerializedBody>;

/** Reads a native incoming source and returns a value for validation. */
export type BodyDeserializer<TSource> = (
	source: TSource,
) => unknown | Promise<unknown>;

/** Provides optional body operations for matching normalized media types. */
export type BodyCodec<TSource> = {
	match: (mediaType: string) => boolean;
	serialize?: BodySerializer;
	deserialize?: BodyDeserializer<TSource>;
};
```

`match(mediaType)` is synchronous and receives a lowercase base media type,
without parameters. Missing or empty incoming `Content-Type` bypasses codec
resolution and produces `undefined`; matchers never receive `""`. The
serializer's `declaredContentType` argument is the selected declaration
verbatim, including parameters. Deserializers inspect the full incoming header
through their native source; `mediaType` and the complete `Content-Type` header
are deliberately distinct values. Parameters guide decoding within a codec,
rather than requiring parameter-specific matcher context.

Deserializers have no additional route, framework context, or schema argument.
The source is unconsumed when delivered. Reading, buffering, or normalizing it
is the custom codec's responsibility. The source type is required explicitly
when annotating a standalone codec and inferred from entry-point options:

| Entry point          | Custom deserializer source (`TSource`)                         |
| -------------------- | -------------------------------------------------------------- |
| Fetch client         | `Response`                                                     |
| Fetch server handler | `Request`                                                      |
| Node server handler  | `IncomingMessage`                                              |
| Hono                 | `Request` (`context.req.raw`)                                  |
| Express raw parsing  | Express `Request`, which extends `IncomingMessage`             |
| Fastify raw parsing  | `FastifyRequest`, with an unconsumed payload stream in `.body` |
| Nest with Express    | Express `Request`, via `expressBodyCodecs`                     |
| Nest with Fastify    | `FastifyRequest`, via `fastifyBodyCodecs`                      |

Nest exposes separate `expressBodyCodecs` and `fastifyBodyCodecs` options,
each typed for its concrete platform source. Users supply the option for their
HTTP platform; callbacks do not need to narrow an Express/Fastify union.
During module initialization, supplying the other platform's option is an
error, even if its array is empty or its rules only serialize. Supplying both
options therefore also fails. Omitting both uses the built-in defaults. Nest
does not expose a generic `bodyCodecs` option. Native
request/context fields on route handlers remain unchanged. Fetch-only codecs
can be shared using `BodyCodec<Request | Response>` because both sources expose
the Fetch body APIs. Native codecs are not guaranteed to be portable, though
users may explicitly normalize their source or prepare portable outputs.

Both operations are optional. Resolution skips a rule lacking the requested
operation **before** calling its matcher, then selects the first matching rule
that supplies the operation. A rule with neither callback contributes nothing.
Arrays are readonly, evaluated in user order, and followed by built-in
fallbacks. There is no public codec registry. The approved `@rest-rpc/core/codecs`
subpath exports `defaultBodyCodecs`, `normalizeMediaType`, `serializeBody`,
`deserializeBody`, `resolveBodySerializer`, and `resolveBodyDeserializer` for
client and adapter reuse. These helpers are not re-exported from the package
root; codec types are. The operation resolvers receive a normalized media type,
user rules, and optional fallback rules; omitting fallbacks allows native
adapters to resolve custom callbacks before deciding whether to bridge to Fetch.
The serialize/deserialize convenience functions use Fetch-compatible defaults,
while native adapters retain responsibility for their built-in delivery bridges.

`SerializedBody.body` is required but typed as `unknown`: a custom codec owns
preparing it for the destination's native delivery API. This does not imply
that every body is portable. A plain object cannot be sent through Node's
`res.end()`; a native failure propagates rather than triggering an implicit
conversion or rest-rpc compatibility check. The shared serializer signature
is source-independent. Its header record matches existing handler response
header values; adapters omit undefined entries and normalize numeric values
when writing headers. Empty route results bypass serialization. Custom codecs
own any stream's lifecycle and errors; ordinary codec streaming is not an
officially supported library feature.

### Client options

```ts
// Added to the existing ApiClientOptions:
bodyCodecs?: readonly BodyCodec<Response>[];
```

Both outgoing requests and incoming ordinary responses use this array, with
independent operation resolution. `bodyParser` and `ApiClientBodyParser` are
removed in the new API. A deserialize-only codec replaces the old callback and
can also override JSON parsing. No per-call codec override or size option is
added. Existing `validateResponses` controls schema validation only; media-type
acceptance is always checked when retained by the runtime contract.

### Server options

```ts
/** Selects raw codec parsing or a framework-parsed request value. */
export type RequestBodyOptions =
  | { source: "framework"; maxBytes?: never }
  | { source: "raw"; maxBytes?: number };

/** Selects codec serialization and raw delivery or framework serialization. */
export type ResponseBodyOptions = { mode: "raw" | "framework" };

// Added to Express/Fastify RegisterRoutesOptions:
// TSource is the native source for that entry point, as listed above.
bodyCodecs?: readonly BodyCodec<TSource>[];
requestBody?: RequestBodyOptions;
responseBody?: ResponseBodyOptions;

// Added to RestRpcModuleOptions (ExpressRequest aliases Express's Request):
expressBodyCodecs?: readonly BodyCodec<ExpressRequest>[];
fastifyBodyCodecs?: readonly BodyCodec<FastifyRequest>[];
requestBody?: RequestBodyOptions;
responseBody?: ResponseBodyOptions;

// Added to Fetch/Node Create*HandlerOptions and Hono RegisterRoutesOptions:
// TSource is Request for Fetch/Hono, IncomingMessage for Node.
bodyCodecs?: readonly BodyCodec<TSource>[];
requestBody?: { source: "raw"; maxBytes?: number };
responseBody?: { mode: "raw" };
```

`RequestBodyOptions` and `ResponseBodyOptions` are explicit root exports from
`@rest-rpc/server`, re-exported explicitly by Express, Fastify, and Nest.
Fetch, Node, and Hono support only raw parsing and raw delivery; their option declarations
use the narrower shapes shown above. Express supports opting its response into
framework ownership through its ordinary `res.send(value)` path as well as its
default rest-rpc writer. Omitted source/mode options use the defaults in the table.
Codecs apply only to directions owned by rest-rpc. Configuration that provides
an operation when that direction is framework-owned is rejected at setup, so
an override cannot silently do nothing.

Existing server `bodyParser` options and their root-exported callback types
(`FetchBodyParser`, `NodeBodyParser`, and `HonoBodyParser` where exported) are
removed. Node custom deserializers retain native `IncomingMessage` access;
Hono custom deserializers receive the native Fetch `Request`, not Hono context. Native handler request fields remain
available to handlers, outside codec callbacks.

The default raw server request limit is **1,048,576 bytes (1 MiB)**.
`maxBytes` must be a positive safe integer; zero, fractions, infinity, and
negative values are setup errors. The count is the wire body bytes made
available by the adapter, including multipart overhead, before schema parsing.
Exactly the limit is accepted; the next byte yields HTTP 413. This is a byte
limit, not an object-count or character limit. Decompression, if performed
upstream, determines which bytes reach this boundary.

An explicit `requestBody.maxBytes` together with **any** user `deserialize`
operation is rejected at setup, even if its matcher is narrow. Without an
explicit limit, unmatched requests retain the default 1 MiB limit and matched
custom deserializers own their policy. This is a runtime configuration check;
TypeScript is not expected to prove callback presence across arbitrary arrays.
Serialize-only rules may be combined with `maxBytes`.

### Outgoing headers and content-type selection

Header names compare case-insensitively. Start with client global headers or
server existing delivery headers, merge codec headers, then merge validated
route request headers or response headers; the route's validated value wins
collisions. Client per-call Fetch options still cannot contain raw headers.

`Content-Type` is reserved: reject it in codec `headers`, typed route headers,
and client global headers. Use the dedicated route declaration and serializer
directive. Codec output also cannot set `Content-Length` or `Transfer-Encoding`;
the adapter/runtime owns framing. Other codec headers are untyped and are never
fed into the route header schema.

Resolve the final `Content-Type` after merging headers. Omission uses the
selected declaration. A string must have the same normalized base media type
as the selected declaration; parameters can change (for example, charset or
boundary), but changing the protocol is an outgoing serialization error.
`null` removes the static content-type header and lets the destination native
runtime generate one if it supports that behavior. It does not instruct a Node
adapter to reinterpret a custom output through Fetch. A native codec that
encodes multipart bytes supplies the full boundary-bearing string explicitly.

Fetch built-in multipart serialization returns `{ body: form, contentType: null }`.
Node built-in multipart preparation instead produces a natively deliverable
encoded body and its explicit generated boundary-bearing `contentType`.
The same native preparation applies to raw Node-backed framework responses.
Other built-ins retain the selected declaration while preparing their wire
output for the destination. Built-in binary inputs must be `Blob`, text must
be `string`, URL-encoded inputs must be `URLSearchParams`, and multipart inputs
must be `FormData`; incompatible values throw instead of being coerced. JSON
uses `JSON.stringify`; an undefined serialization result or exception is an
error. These built-in input requirements do not constrain custom codec outputs.

Single media-type declarations select that type automatically. Arrays require
an explicit member: client call option `contentType` for requests, handler result
`contentType` for response envelopes. That handler field is an outgoing
selection, not an echo of the request. Plain `.output()` accepts a single media type only in this target API; use
`.response()` when outgoing selection is required. Its `BodyOptions` overload
is narrowed accordingly, and runtime array declarations are rejected.
`.input()` continues to support arrays with the client call selector.
Route wildcards are not added: `image/*` and `application/*+json` are codec
matcher concepts, while route declarations must use concrete media types.

### Incoming acceptance, empty bodies, and failures

Normalize both received and declared types for acceptance; compare base types
exactly. A JSON codec accepting `+json` does not let an `application/json` route
accept `application/problem+json` unless separately declared. Parameters such
as charset and multipart boundaries do not affect acceptance.

A missing or empty incoming `Content-Type` takes the `undefined` body path
before media-type acceptance or codec resolution, for both requests and ordinary
responses. No codec is called and no body is read, even if the transport carries
bytes; bytes alone do not imply a media type. A declared body schema determines
whether `undefined` is valid. Under framework ownership the same rule applies
before supplying the framework-parsed value to validation.

For a declared request body, a present unsupported media type yields HTTP
415 before deserialization, including under framework ownership. A supported
but malformed built-in body yields HTTP 400; an oversized built-in body yields 413. No declared request body means no codec invocation or stream read.
Declared body schemas receive `undefined` for an absent body after media-type
acceptance, and determine whether it is valid. A zero-byte stream is absent;
JSON `null` is a present value. The client similarly skips ordinary parsing for
bodyless declared responses, HEAD responses, and HTTP 204/205/304.

A contract-first client rejects an unexpected present response media type
for a declared body before deserialization. A server-first client
without retained response media types resolves from the received header,
using the binary fallback only for present media types unmatched by other rules.
Missing or empty headers produce `undefined` on both client paths.
Validation follows parsing;
`validateResponses: false` does not change parsing or transport acceptance.

Built-in parsing failures and transport rejection are distinct from existing
schema validation errors and do not call schema-validation error hooks. Custom
callback exceptions propagate to the surrounding runtime (client promise
rejection, server framework error handling, or rejection of the Fetch/Node
handler). Outgoing serializer failures likewise propagate; adapters must not
start delivery before serialization succeeds. Failures after a custom stream
has started are owned by that stream/runtime. Library-generated transport error
responses use fixed JSON encoding and bypass user codecs. No new public error
class or transport-error callback is added in this proposal.

## Usage examples for API review

These are target examples, not examples runnable against the current release.
Each server and client must configure the same wire protocol independently;
native source and output handling may differ between transports.

### Built-in JSON, text, forms, multipart, and binary

```ts
import { initClient, route } from "@rest-rpc/core";
import { createRouteHandler, implement } from "@rest-rpc/fetch";
import { z } from "zod";

export const api = {
	json: route
		.post("/json")
		.body(z.object({ title: z.string() }))
		.response(200, z.object({ title: z.string() })),
	text: route
		.post("/text")
		.body(z.string(), { contentType: "text/plain" })
		.response(200, z.string(), { contentType: "text/plain" }),
	form: route
		.post("/form")
		.body(z.instanceof(URLSearchParams), {
			contentType: "application/x-www-form-urlencoded",
		})
		.response(200, z.instanceof(URLSearchParams), {
			contentType: "application/x-www-form-urlencoded",
		}),
	upload: route
		.post("/upload")
		.body(z.instanceof(FormData), { contentType: "multipart/form-data" })
		.response(200, z.instanceof(FormData), {
			contentType: "multipart/form-data",
		}),
	image: route
		.post("/image")
		.body(z.instanceof(Blob), { contentType: ["image/png", "image/jpeg"] })
		.response(200, z.instanceof(Blob), {
			contentType: ["image/png", "image/jpeg"],
		}),
};

const routes = {
	json: implement(api.json).handler(({ body }) => ({ status: 200, body })),
	text: implement(api.text).handler(({ body }) => ({ status: 200, body })),
	form: implement(api.form).handler(({ body }) => ({ status: 200, body })),
	upload: implement(api.upload).handler(({ body }) => ({ status: 200, body })),
	image: implement(api.image).handler(({ body, request }) => ({
		status: 200,
		body,
		contentType: request.headers
			.get("content-type")!
			.split(";")[0]!
			.trim()
			.toLowerCase() as "image/png" | "image/jpeg",
	})),
};

const handler = createRouteHandler(routes, {
	requestBody: { source: "raw", maxBytes: 8 * 1024 * 1024 },
});
// Mount handler in the Fetch runtime; its result is { matched, response }.

const client = initClient(api, { baseUrl: "https://api.example.com" });
await client.json({ body: { title: "Hello" } });
await client.text({ body: "Hello" });
await client.form({ body: new URLSearchParams({ title: "Hello" }) });

const form = new FormData();
form.append("title", "Hello");
form.append(
	"file",
	new File(["contents"], "hello.txt", { type: "text/plain" }),
);
const upload = await client.upload({ body: form });
upload.body; // FormData; no object conversion, boundary generated by runtime.

const image = await client.image(
	{ body: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) },
	{ contentType: "image/png" },
);
image.body; // Blob; no inferred File or Uint8Array conversion.
image.headers.get("content-type"); // Raw received header; no image.contentType.
```

### Custom object-to-form protocol

This explicitly opts a route into object conversion. Matching does not depend
on finding a File somewhere in the value.

```ts
import { initClient, route, type BodyCodec } from "@rest-rpc/core";
import { createRouteHandler, implement } from "@rest-rpc/fetch";
import { z } from "zod";

const submission = z.object({ title: z.string(), file: z.instanceof(File) });
const formCodec: BodyCodec<Request | Response> = {
	match: (mediaType) => mediaType === "multipart/form-data",
	serialize(value) {
		const input = submission.parse(value);
		const form = new FormData();
		form.set("title", input.title);
		form.set("file", input.file);
		return { body: form, contentType: null };
	},
	async deserialize(source) {
		const form = await source.formData();
		return { title: form.get("title"), file: form.get("file") };
	},
};

const api = {
	submit: route
		.post("/submit")
		.body(submission, { contentType: "multipart/form-data" })
		.response(200, z.object({ title: z.string() })),
};
const routes = {
	submit: implement(api.submit).handler(({ body }) => ({
		status: 200,
		body: { title: body.title },
	})),
};
const handler = createRouteHandler(routes, { bodyCodecs: [formCodec] });
const client = initClient(api, {
	baseUrl: "https://api.example.com",
	bodyCodecs: [formCodec],
});
await client.submit({
	body: { title: "Hello", file: new File(["hi"], "hi.txt") },
});
// The server's custom deserializer owns its size policy. JSON responses still
// use the built-in JSON operations and default validation.
```

### Partial overrides, broad matching, and codec headers

```ts
import { initClient, type BodyCodec } from "@rest-rpc/core";

const codecs: readonly BodyCodec<Response>[] = [
	{
		match: (mediaType) => mediaType === "text/csv",
		serialize(value, declaredContentType) {
			if (typeof value !== "string") throw new TypeError("Expected CSV text");
			return {
				body: value,
				contentType: `${declaredContentType}; charset=utf-8`,
				headers: { "content-disposition": 'attachment; filename="report.csv"' },
			};
		},
	},
	{
		match: (mediaType) => mediaType.startsWith("image/"),
		async deserialize(source) {
			// Explicit binary protocol: incoming values are Uint8Array, not Blob.
			return new Uint8Array(await source.arrayBuffer());
		},
	},
];
// CSV reads still use the built-in text deserializer. Image writes still use
// the built-in Blob serializer. Incoming image schemas must accept Uint8Array.
// "image/*" matching does not expand any route's accepted content types.
const client = initClient(api, {
	baseUrl: "https://api.example.com",
	bodyCodecs: codecs,
});
// api is the application's contract with matching body schemas.
```

For Fetch sources, a global deserialize override is `{ match: () => true, deserialize: source =>
source.text() }`; serialization still uses defaults. A global serializer uses
`match: () => true` with only `serialize`. A broad JSON matcher is
`mediaType => mediaType === "application/json" || mediaType.endsWith("+json")`.
These overrides include JSON and require compatible route schemas.

### Native Node codec

This codec receives the original Node request and returns a native Buffer for
response delivery. Its JSON wire protocol remains compatible with the default
Fetch client; sharing identical callback implementations is unnecessary.

```ts
import { Buffer } from "node:buffer";
import type { IncomingMessage } from "node:http";
import { initClient, route, type BodyCodec } from "@rest-rpc/core";
import { createRouteHandler, implement } from "@rest-rpc/node";
import { z } from "zod";

const nodeJsonCodec: BodyCodec<IncomingMessage> = {
	match: (mediaType) => mediaType === "application/json",
	async deserialize(request) {
		// A native parser can be called here directly with request.
		// This example owns its own buffering and byte-limit policy.
		const chunks: Buffer[] = [];
		let bytes = 0;
		for await (const chunk of request) {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			bytes += buffer.length;
			if (bytes > 2 * 1024 * 1024)
				throw new Error("Custom parser limit exceeded");
			chunks.push(buffer);
		}
		return bytes === 0
			? undefined
			: JSON.parse(Buffer.concat(chunks).toString("utf8"));
	},
	serialize(value) {
		const json = JSON.stringify(value);
		if (json === undefined) throw new TypeError("Expected a JSON value");
		return {
			body: Buffer.from(json, "utf8"),
			headers: { "x-codec-version": 1 },
		};
	},
};

const api = {
	echo: route
		.post("/echo")
		.body(z.object({ title: z.string() }))
		.response(200, z.object({ title: z.string() })),
};
const routes = {
	echo: implement(api.echo).handler(({ body }) => ({ status: 200, body })),
};
const handler = createRouteHandler(routes, {
	requestBody: { source: "raw" },
	responseBody: { mode: "raw" },
	bodyCodecs: [nodeJsonCodec],
});
// No requestBody.maxBytes: the custom deserializer owns the limit.
// Its exception follows custom callback error handling, not built-in HTTP 413.
// Matching custom JSON parsing never constructs a Fetch Request.
// Other media types fall back to built-in parsing with the default server limit.

const client = initClient(api, { baseUrl: "https://api.example.com" });
const result = await client.echo({ body: { title: "Hello" } });
result.headers.get("x-codec-version"); // "1"
```

### Adapter ownership configuration

The following snippets use each application's existing implementation tree.

```ts
// Fetch and Node: same options; Node callbacks still take native req/res.
import { createRouteHandler } from "@rest-rpc/node";
const handler = createRouteHandler(routes, {
	bodyCodecs: [csvSerializeOnlyCodec],
	requestBody: { source: "raw", maxBytes: 4 * 1024 * 1024 },
});
```

```ts
// Express: select raw request parsing through the adapter options.
import { registerRoutes } from "@rest-rpc/express";
registerRoutes(app, routes, {
	requestBody: { source: "raw", maxBytes: 4 * 1024 * 1024 },
});
```

```ts
// Fastify: independent ownership choices.
import { registerRoutes } from "@rest-rpc/fastify";
registerRoutes(app, routes, {
	responseBody: { mode: "raw" },
	bodyCodecs: [csvSerializeOnlyCodec],
}); // Requests still use Fastify's parsers and size policy.

// Select raw requests and framework response serialization independently.
registerRoutes(app, rawRoutes, {
	requestBody: { source: "raw", maxBytes: 4 * 1024 * 1024 },
	responseBody: { mode: "framework" },
});
```

```ts
// Hono: Fetch parsing and encoding are always rest-rpc-owned.
import { registerRoutes } from "@rest-rpc/hono";
registerRoutes(app, routes, {
	requestBody: { source: "raw", maxBytes: 4 * 1024 * 1024 },
});
```

```ts
// Nest module: requests remain framework-owned; responses opt into rest-rpc.
import { Module } from "@nestjs/common";
import { RestRpcModule } from "@rest-rpc/nest";
@Module({
	imports: [
		RestRpcModule.forRoot({
			responseBody: { mode: "raw" },
			expressBodyCodecs: [csvSerializeOnlyCodec], // For the Express HTTP platform.
		}),
	],
})
export class ApiModule {}

// For the Fastify HTTP platform, select its codec option instead:
RestRpcModule.forRoot({
	responseBody: { mode: "raw" },
	fastifyBodyCodecs: [csvSerializeOnlyCodec],
});

// Select raw request parsing through the module options:
RestRpcModule.forRoot({
	requestBody: { source: "raw", maxBytes: 4 * 1024 * 1024 },
});
```

`csvSerializeOnlyCodec` means the serialize-only CSV rule from the preceding
example; application names (`app`, `routes`, `rawRoutes`) are placeholders.
Raw request parsing requires an unconsumed source; configuring framework
parsers or automatic response handling is outside this spec's scope.

## Implementation and acceptance checklist (after API approval)

1. Add the explicitly exported codec types, defaults, and operation resolution
   in core; update client serialization/deserialization and remove incoming
   content-type metadata while retaining outgoing selection.
2. Add bounded built-in Fetch request reading; Node resolves custom native
   deserializers first and bridges only for built-in fallback. Enforce media-type
   acceptance before parsing. Preserve abort signals and bodyless/NDJSON paths.
3. Separate validated logical results from codec encoding and native delivery
   in server; implement the declared adapter ownership defaults and options.
4. Verify each built-in format with real HTTP tests, including multipart output
   through native Node/framework writers, exact size-boundary handling, 415/400/
   413 distinctions, header precedence, and custom callback propagation. Verify
   that matching native deserializers bypass Fetch conversion and custom native
   output is delivered without built-in coercion. No-operation rules must be inert.
   Verify Nest rejects codec options for the inactive HTTP platform at initialization.
5. Add type tests for optional operations, native source types, source/mode
   restrictions, Nest platform-specific codec options, response metadata,
   request/response array selection, and root exports; retain declaration and
   hover smoke checks. Check contract-first and generated server-first clients.
6. Update `content/docs/` with the target examples and migration from old parser
   callbacks, object form conversion, binary coercion, and incoming metadata.
7. Run relevant unit/integration suites, workspace typechecking, and lint.

The approved implementation scope currently includes only the shared codec
subpath and Fetch client wiring, with a commit for each pass. Server work may
begin only after further user review and authorization. Any
change to these public signatures or observable rules requires revising this
spec for review first; implementation must not choose a different API silently.
