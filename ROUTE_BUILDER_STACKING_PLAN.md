# Route builder stacking implementation plan

## Goal

Make route declarations permissive in two independent ways:

1. Allow the HTTP method to be selected before or after request declarations.
2. Allow multiple schemas for the same request location and merge their validated
   object outputs.

Do this without preserving restrictions through increasingly expensive builder
type state. Invalid HTTP combinations remain documented runtime invariants. The
separate proposal to combine flat `.input()` with `.headers()` is not required
for either goal and must not be hidden in the same change.

Every commit below should build and pass its relevant unit and type tests. No
adapter or transport behaviour changes, so the work does not require HTTP
integration tests.

## Commit 0: allow the built-in type schema to map its output

Make the existing `type<T>()` helper express different input and output types
before changing the route builder:

```ts
const identity = type<number>();
// StandardSchemaV1<number, number>

const normalized = type<number>((input) => Math.max(0, input));
// StandardSchemaV1<number, number>

const mapped = type<number, string>((input) => input.toString());
// StandardSchemaV1<number, string>
```

Use overloads so the existing call remains unchanged:

```ts
export function type<TInput>(
	map?: (input: TInput) => TInput,
): StandardSchemaV1<TInput, TInput>;
export function type<TInput, TOutput>(
	map: (input: TInput) => TOutput,
): StandardSchemaV1<TInput, TOutput>;
```

The mapper is synchronous and performs transformation only. It does not turn
the helper into a validator: the unknown runtime value is asserted to be
`TInput` before calling the mapper, no issues are produced, and an exception
thrown by the mapper propagates normally. Typing the mapper value as `TInput`
is an intentional convenience; making it `unknown` would merely force users to
repeat narrowing that this unchecked helper cannot establish itself. This
matches the package's existing rule that API contract schemas must validate
synchronously.

Supplying one generic fixes both input and output to that type, so any mapper
must return `TInput`. A mapper that changes the output type requires both
generics explicitly:

```ts
type<number>((input) => input.toString()); // type error
type<number, string>((input) => input.toString()); // valid
```

Update the helper TSDoc and schema documentation so `type<T>()` is described as
an unchecked schema rather than strictly a type-only identity schema. Add
focused unit and declaration-type tests for:

- Existing identity behaviour and inference.
- Mapper invocation and returned runtime value.
- Distinct inferred input and output types.
- A one-generic mapper being required to return `TInput`.
- A changed mapper output requiring an explicit `TOutput` generic.
- Mapper parameter and return types following the two explicit generics.

This commit changes only the helper, its tests and its documentation. It does
not introduce schema piping or alter route composition. A multi-stage
transformation should still be expressed inside one schema (including one
mapped `type()` schema), not by assigning pipeline semantics to repeated route
inputs.

## Intended behaviour

### Method order

These declarations are equivalent:

```ts
route.get("/todos").query(querySchema);
route.query(querySchema).get("/todos");
```

The builder types should expose both orders without attempting to encode every
method-specific HTTP rule. Once both the method and request declaration are
known, the runtime builder validates rules such as:

- GET cannot have a body.
- GET flat input is encoded as query input.
- Body content types must be valid for the selected method.
- Repeated declarations for one body location must agree on its content type.

The declaration should fail as soon as the conflicting pieces are both known,
regardless of their order. There is no benefit in retaining large conditional
types solely to turn these obvious configuration errors into compiler errors.

### Stacked request schemas

Each request location stores its schemas in declaration order:

```ts
request: {
  query: [paginationSchema, filterSchema],
  headers: [authenticationSchema, tracingSchema],
}
```

All schemas for a location validate the same original wire value. They are not
a transformation pipeline. This gives the input and output sides different
type operations:

```ts
type ClientInput = InputOf<Schema1> & InputOf<Schema2>;
type HandlerValue = RightMerge<OutputOf<Schema1>, OutputOf<Schema2>>;
```

Consequently, incompatible input fields become impossible:

```ts
route.input(z.object({ id: z.string() })).input(z.object({ id: z.number() }));

// Client input contains `id: never` (or reduces to an equivalent impossible type).
```

Validated outputs are merged in declaration order using the same later-value
wins rule as `Object.assign`. A single schema retains its output unchanged and
may therefore produce a primitive. When two or more schemas are declared for a
location, every successful output must be a non-null object. A non-object output
is a documented runtime configuration error because it cannot be known without
executing the schema.

If any schema reports validation issues, the request fails and no partial
merged value is exposed. Issues from all schemas may be collected so callers
can see every failure against the original value.

### Flat input remains separate from segmented input

This work retains the existing choice between:

```ts
route.input(schema);
```

and segmented declarations:

```ts
route.body(schema);
route.query(schema);
route.params(schema);
route.headers(schema);
```

In particular, `.input(...).headers(...)` is not enabled by the first two
commits. Supporting it changes the server handler shape and creates a client
header requirement that is not structurally present in the flat input value.
That is a distinct feature, not a prerequisite for permissive ordering or
schema stacking.

## Commit 1: allow method selection in either order

Keep each request location limited to one schema in this commit. This isolates
the builder-order change from schema composition.

### Runtime builder

- Store an optional selected method in the internal builder state.
- Keep flat input neutral until the method is known; materialize it as query for
  GET and body for body-capable methods.
- Run method/request invariant checks whenever a setter supplies the missing
  half of an already partially declared route.
- Keep `.input()` mutually exclusive with all segmented request methods,
  including `.headers()`.
- Do not change output or response uniqueness rules.

### Builder types

- Add method availability as a small independent state rather than duplicating
  method-specific versions of every request setter.
- Expose HTTP method methods until one is selected.
- Expose request setters before and after method selection.
- Retain one request-mode discriminant such as `none | flat | segments`; avoid
  carrying both `flat: boolean` and a second partially overlapping `input`
  state.
- Remove conditional machinery whose only purpose was preventing HTTP
  combinations that the runtime invariant checks now cover.

### Tests

Add route-builder unit and declaration-type tests for:

- Method-first and method-last declarations producing the same route.
- Flat input moving to query for GET and body for other methods.
- Invalid combinations failing once the method becomes known in either order.
- `.input()` and segmented request declarations remaining mutually exclusive.
- Method selection remaining single-use.

This commit should not touch client header inference, server handler fields or
global-header requirements.

## Commit 2: add stacked request schemas

### Route declaration and builder runtime

- Change body, query, params and headers in the request declaration to ordered
  schema arrays.
- Append in each corresponding builder setter rather than replacing the
  previous schema.
- Allow repeated `.input()` calls as stacked flat object fragments.
- Require one effective content type for a stacked body. Reject conflicting
  declarations rather than silently choosing one.
- Keep responses and status-specific response bodies singular; request-schema
  output merging is unrelated to route `.output()` and `.response(status)`.

### Type inference

Use separate helpers for the two directions:

```ts
type InferSchemaInputs<TSchemas> = IntersectInputsInOrder<TSchemas>;
type InferSchemaOutputs<TSchemas> = RightMergeOutputsInOrder<TSchemas>;
```

Do not reuse the right-biased output merge for inputs. Every schema validates
the original value, so every input constraint must remain present.

Keep the helpers in the core contract package and reuse their exported result
types from the server package where possible. Do not maintain duplicate schema
list inference implementations in core and server.

### Server validation

- Validate every schema against the original raw segment.
- Preserve a single successful schema output verbatim.
- For multiple successful schemas, verify that every output is an object and
  merge them in declaration order.
- Aggregate validation issues and do not merge when any schema fails.
- Give a direct configuration error for a non-object output in a stack,
  including the request location and schema index.

### OpenAPI converter contract

Keep the schema-array converter introduced by stacking, but define it honestly:

```ts
type SchemaConverter = (
	schemas: readonly StandardSchemaV1[],
	mode: "input" | "output",
) => OpenApiSchema | undefined;
```

For request locations, the converter must account for every schema in the
array. It must not select `schemas[0]`. For stacked object fragments it should
use the validation library's native object composition and return the effective
object schema.

For path, query and headers, the result must expose top-level `properties` and
`required`, because OpenAPI represents their fields as individual parameters.
Returning only a root `allOf` is insufficient for the current parameter
renderer. For bodies a root `allOf` is valid OpenAPI, but recommending one
conversion strategy for bodies and another implicit strategy for parameters
would make the callback contract unclear. The documented integration should
return the effective object shape for stacked object inputs.

Overlapping fields need an explicit rule. Runtime applies every schema's input
constraint, whereas many validation-library object merge operations make the
later field schema replace the earlier one. For example:

```ts
route
	.input(z.object({ id: z.string().min(3) }))
	.input(z.object({ id: z.string().startsWith("usr_") }));
```

Both constraints run at runtime. A converter must preserve both or reject that
composition. The simplest documented guidance is to use stacking for disjoint
object fragments and express repeated-field constraints in one schema.

Responses continue to pass a one-element array. The documentation should say
this directly rather than implying that response schemas are stacked.

Root-relative `$ref`/`$defs` handling is not part of this change. The previous
parameter implementation already extracted properties without carrying parent
definitions. Converter output must therefore continue to use inline property
schemas or references that already target valid OpenAPI components. Stacking
does not need generic reference rebasing or oRPC-style JSON Schema
reconstruction.

### Tests

Add focused unit tests for:

- Declaration arrays preserving setter order.
- Every schema receiving the same original value.
- Right-biased merging of validated outputs.
- A single primitive output remaining valid.
- A primitive in a multi-schema stack producing the documented error.
- Validation issues from multiple schemas being reported.
- Conflicting schema input fields inferring an impossible type.
- Later output fields determining the handler field type.
- The OpenAPI converter receiving every schema in declaration order.
- A converter-produced combined object generating all stacked path, query and
  header parameters.
- A converter-produced combined body documenting all stacked body fields.
- Response conversion receiving exactly one schema.

These are unit-level properties. Route-builder, validation, type-declaration,
client-with-fake-fetch and OpenAPI operation tests cover them more directly than
real HTTP adapter tests.

## Commit 3: consider flat input plus headers separately

Do not include this commit unless the feature itself is accepted after the
first two commits make its actual cost visible.

The intended user-facing shape would remain:

```ts
client(input, options);
```

It must not become:

```ts
client({ input, headers });
```

because that defeats the purpose of flat `.input()`.

If accepted:

- The server handler may receive `{ input, headers }` while the client continues
  to pass only the flat input value.
- Required declared headers must be satisfiable through configured global
  headers using the same structural optional-header rules as segmented routes.
- Keep the missing-header constraint local to the flat request representation,
  for example with a phantom/branded structural member that ordinary call
  assignability can observe.
- Do not introduce a branded `MissingGlobalHeaders` sentinel that is threaded
  through `ClientRequestForDeclaration`, `InferClientRequest` and `FetchArgs`.
- Do not add a separate `RequiredKeys` calculation when the existing optional
  header transformation and `{}` assignability can determine whether required
  fields remain.
- Measure declaration output and downstream type-check performance before
  accepting additional client type machinery.

Add type tests for required, optional and globally supplied headers, plus
server handler tests for the `{ input, headers }` shape. No other commit should
contain these changes.

## Documentation rewrite

Update documentation alongside the commit that introduces each behaviour.
Describe observable behaviour rather than the implementation history or why a
large diff exists.

The route-builder documentation should include:

- Equivalent method-first and method-last examples.
- Repeated request declarations and declaration-order output merging.
- The rule that every schema validates the original wire value.
- Input intersection versus validated-output merging.
- The multi-schema object-output invariant.
- Runtime HTTP invariants and when configuration errors are reported.
- The continued separation between flat and segmented input.

The OpenAPI documentation should include:

- The exact schema-array converter signature.
- A complete converter example that consumes every schema.
- The top-level object requirement for path, query and header parameter
  generation.
- The disjoint-fragment guidance for native object merging.
- The existing inline-or-valid-component-reference requirement.

Delete guidance that uses only `schemas[0]` or casually suggests returning
`allOf` without explaining that the current parameter renderer cannot discover
properties beneath it.

## Completion checks

Run the focused core and server builds, unit tests and declaration-type tests
after each commit. At the end, run:

```sh
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run bench:typecheck -- "stacked request schemas and permissive route ordering"
```

The type-check benchmark matters because the explicit trade-off is to prefer
documented runtime invariants over expensive type-state prevention. A benchmark
regression should be treated as a design problem, not accepted merely because
the inferred types remain correct.
