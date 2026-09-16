# Body serialization and parsing spec

This document records the intended v1 behavior before implementation. It covers
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
the ordinary Fetch body operation for the selected type:

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
with broad rules. A deserializer receives the original Fetch `Request` or
`Response` and can read the full, unmodified `Content-Type` and other headers
from `.headers`. It reads the body once using the Fetch body API. Node adapts
its incoming message to a Fetch `Request`, as it already does. Framework
adapters construct a Fetch-shaped source only when the user opts into
rest-rpc-owned raw-body parsing.

A serializer receives the value to send and returns the wire body. It may also
return untyped HTTP headers derived from that value and a `contentType`
directive:

- Omitted `contentType` uses the selected declared media type.
- A string sets that exact outgoing header, including any parameters.
- `null` instructs the adapter not to set a static header and to let the
  transport runtime generate the correct one, such as a multipart boundary.

An adapter must actually support runtime-generated headers when it accepts
`contentType: null`; merely omitting a header on a native Node response is not
enough. `Content-Type` is controlled through the dedicated directive rather
than through the callback's generic header output. The callback's extra
headers stay outside the typed response-header
contract. Declared `responseHeaders` continue to be validated through their
existing route schema; codec headers are available to the client as raw
`response.headers`. Exact header-collision precedence is an API detail to
settle during implementation.

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
| Node server handler  | rest-rpc parses requests via Fetch | rest-rpc serializes responses | Node bridges `IncomingMessage` to Fetch parsing; it does not define another body parser.                                                                  |
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
**unconsumed** body and run the shared deserializer. The user is responsible
for turning off framework body parsing for that path. The adapter must fail
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

- `@rest-rpc/core` owns the ordered matcher resolution, codec contract, and
  plain defaults for both directions. It uses the Fetch body APIs already
  available to the core client and does not depend on server adapters.
- `@rest-rpc/fetch` owns bounded raw server request reading and calls the core
  deserializer. `@rest-rpc/node` adapts requests to the same Fetch path.
- `@rest-rpc/server` keeps route/schema validation and logical result
  normalization. Its current `sendJson` / `sendCustom` writer callback model
  should be revised so codec encoding, framework delegation, and adapter
  delivery are explicit separate steps. Empty bodies and NDJSON retain their
  own paths.
- Adapters bridge the shared codec's wire body and headers to their native
  request/response APIs. They do not add value-driven body transforms.

## Documentation and remaining API choices

A focused documentation page should state the default values above, explain
matcher order and partial overrides, show how to replace either direction,
and state buffering and size-limit ownership. Existing scattered form,
multipart, custom-body, and parser notes in `content/docs/` should link to that
page rather than repeat competing transport rules. Adapter pages should state
their default owner for each direction and show the minimum framework setup
for the rest-rpc raw-body opt-in.

The exact option names, matcher and callback TypeScript signatures, finite
default server byte limit, framework opt-in shape, and header-collision rule
remain to be selected during implementation. These choices must preserve the
ownership and wire-behavior invariants above.
