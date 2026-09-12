import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	CustomBody,
	CustomBodyContentType,
	CustomResponseBody,
	CustomResponseInput,
	CustomResponseValue,
	FormBody,
	FormBodySchema,
	MultipartBody,
	MultipartBodySchema,
	NoBody,
	Stream,
} from "./body.ts";
import type {
	CommonOpenApiRouteOptions,
	HttpMethod,
	OpenApiRouteOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "./routeDeclaration.ts";
import type {
	JsonQuery,
	RequestHeadersDeclaration,
	RequestHeadersSchema,
	RequestParamsSchema,
	RequestQuerySchema,
} from "./request.ts";
import type { RegularResponseDeclaration, RouteResponses } from "./response.ts";

type EmptyObject = Record<never, never>;

/** Defaults applied to routes created from a configured builder. */
export type RouteBuilderOptions = {
	pathPrefix?: string;
	metadata?: RouteMetadata;
	responses?: RouteResponses;
	headers?: RequestHeadersSchema;
	openApi?: CommonOpenApiRouteOptions;
};

type BuilderMethod =
	| "body"
	| "input"
	| "output"
	| "query"
	| "params"
	| "headers"
	| "metadata"
	| "openAPI";

type BuilderRoute = {
	readonly kind: "http" | "procedure";
	readonly method: HttpMethod;
	readonly path: string;
};

/** Type state carried by a route-builder view. */
export type BuilderState = {
	route: BuilderRoute;
	request: unknown;
	responses: unknown;
	metadata: RouteMetadata | never;
	openApi: OpenApiRouteOptions | never;
	used: BuilderMethod;
};

type UseMethod<
	TState extends BuilderState,
	TMethod extends BuilderMethod,
> = Omit<TState, "used"> & { used: TState["used"] | TMethod };

type WhenUnused<
	TState extends BuilderState,
	TMethod extends BuilderMethod,
	TView,
> = TMethod extends TState["used"] ? EmptyObject : TView;

type WithRequest<
	TState extends BuilderState,
	TKey extends keyof RouteRequestDeclaration,
	TValue,
	TMethod extends BuilderMethod,
> = UseMethod<
	Omit<TState, "request"> & {
		request: Omit<TState["request"], TKey> & Record<TKey, TValue>;
	},
	TMethod
>;

type WithResponse<
	TState extends BuilderState,
	TStatus extends PropertyKey,
	TResponse,
> = Omit<TState, "responses"> & {
	responses: TState["responses"] & Record<TStatus, TResponse>;
};

type MergeMetadata<
	TMetadata extends RouteMetadata | never,
	TLocal extends RouteMetadata,
> = [TMetadata] extends [never]
	? TLocal
	: Omit<TMetadata, keyof TLocal> & TLocal extends infer TMerged
		? { [TKey in keyof TMerged]: TMerged[TKey] }
		: never;

type WithMetadata<
	TState extends BuilderState,
	TLocal extends RouteMetadata,
> = UseMethod<
	Omit<TState, "metadata"> & {
		metadata: MergeMetadata<TState["metadata"], TLocal>;
	},
	"metadata"
>;

type WithOpenApi<TState extends BuilderState> = UseMethod<
	Omit<TState, "openApi"> & { openApi: OpenApiRouteOptions },
	"openAPI"
>;

type MetadataDeclaration<TMetadata extends RouteMetadata | never> = [
	TMetadata,
] extends [never]
	? EmptyObject
	: { readonly metadata: TMetadata };

type OpenApiDeclaration<TOpenApi extends OpenApiRouteOptions | never> = [
	TOpenApi,
] extends [never]
	? EmptyObject
	: { readonly openApi: OpenApiRouteOptions };

/** Resolves the public declaration represented by builder state. */
export type PublicDeclarationFor<TState> = TState extends BuilderState
	? TState["route"] &
			(keyof TState["request"] extends never
				? { request?: never }
				: { request: TState["request"] }) & {
				responses: TState["responses"];
			} & MetadataDeclaration<TState["metadata"]> &
			OpenApiDeclaration<TState["openApi"]>
	: never;

/** Type-level hook used by packages that add operations to fluent builders. */
export interface BuilderExtension {
	readonly state: unknown;
	readonly path: string;
	readonly metadata: unknown;
	readonly result: unknown;
}

type ApplyExtension<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = [TExtension] extends [never]
	? EmptyObject
	: (TExtension & {
			readonly state: TState;
			readonly path: TState["route"]["path"];
			readonly metadata: TState["metadata"];
		})["result"];

type ResponseMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = {
	/** Declares a response status and schema. @see {@link https://rest-rpc.dev/docs/contract/declaration#responses} */
	response<
		const TStatus extends number,
		const TSchema extends RegularResponseDeclaration | undefined = undefined,
	>(
		status: TStatus,
		schema?: TSchema,
	): RouteBuilderView<
		WithResponse<
			TState,
			TStatus,
			TSchema extends RegularResponseDeclaration ? TSchema : NoBody
		>,
		TExtension
	>;
	/** Declares a custom-content response. @see {@link https://rest-rpc.dev/docs/http-responses#response-with-custom-content-type} */
	customResponse<
		const TStatus extends number,
		const TSchema extends StandardSchemaV1<unknown, CustomResponseValue>,
		const TContentType extends CustomBodyContentType,
	>(
		status: TStatus,
		input: CustomResponseInput<TSchema, TContentType>,
	): RouteBuilderView<
		WithResponse<TState, TStatus, CustomResponseBody<TSchema, TContentType>>,
		TExtension
	>;
	/** Declares an NDJSON response stream. @see {@link https://rest-rpc.dev/docs/http-responses#streaming-ndjson-responses} */
	streamResponse<
		const TStatus extends number,
		const TSchema extends StandardSchemaV1,
	>(
		status: TStatus,
		schema: TSchema,
	): RouteBuilderView<
		WithResponse<TState, TStatus, Stream<TSchema>>,
		TExtension
	>;
	/** Declares a custom-content response stream. @see {@link https://rest-rpc.dev/docs/http-responses#streaming-responses-with-custom-content-type} */
	customStreamResponse<
		const TStatus extends number,
		const TSchema extends StandardSchemaV1<unknown, CustomResponseValue>,
		const TContentType extends CustomBodyContentType,
	>(
		status: TStatus,
		input: CustomResponseInput<TSchema, TContentType>,
	): RouteBuilderView<
		WithResponse<
			TState,
			TStatus,
			Stream<CustomResponseBody<TSchema, TContentType>>
		>,
		TExtension
	>;
};

type BodyMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = WhenUnused<
	TState,
	"body",
	{
		/** Declares a JSON request body. @see {@link https://rest-rpc.dev/docs/http-requests#request-with-json-body} */
		body<const TSchema extends StandardSchemaV1>(
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "body", TSchema, "body">,
			TExtension
		>;
		/** Declares a URL-encoded form body. @see {@link https://rest-rpc.dev/docs/http-requests#request-with-form-body} */
		formBody<const TSchema extends FormBodySchema>(
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "body", FormBody<TSchema>, "body">,
			TExtension
		>;
		/** Declares a multipart form body. @see {@link https://rest-rpc.dev/docs/http-requests#request-with-multipart-body} */
		multipartBody<const TSchema extends MultipartBodySchema>(
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "body", MultipartBody<TSchema>, "body">,
			TExtension
		>;
		/** Declares a custom-content request body. @see {@link https://rest-rpc.dev/docs/http-requests#request-with-custom-content-type} */
		customBody<const TSchema extends StandardSchemaV1>(
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "body", CustomBody<TSchema, undefined>, "body">,
			TExtension
		>;
		customBody<
			const TSchema extends StandardSchemaV1,
			const TContentType extends CustomBodyContentType,
		>(input: {
			schema: TSchema;
			contentType: TContentType;
		}): RouteBuilderView<
			WithRequest<TState, "body", CustomBody<TSchema, TContentType>, "body">,
			TExtension
		>;
	}
>;

type RequestMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = WhenUnused<
	TState,
	"query",
	{
		/** Declares URL query parameters. @see {@link https://rest-rpc.dev/docs/contract/declaration#request-model} */
		query<const TSchema extends RequestQuerySchema>(
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "query", TSchema, "query">,
			TExtension
		>;
		/** Declares a JSON-encoded query value. @see {@link https://rest-rpc.dev/docs/contract/declaration#json-query} */
		jsonQuery<const TSchema extends StandardSchemaV1>(
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "query", JsonQuery<TSchema>, "query">,
			TExtension
		>;
	}
> &
	WhenUnused<
		TState,
		"params",
		{
			/** Declares path parameters. @see {@link https://rest-rpc.dev/docs/contract/declaration#path-params} */
			params<const TSchema extends RequestParamsSchema>(
				schema: TSchema,
			): RouteBuilderView<
				WithRequest<TState, "params", TSchema, "params">,
				TExtension
			>;
		}
	> &
	WhenUnused<
		TState,
		"headers",
		{
			/** Declares request headers. @see {@link https://rest-rpc.dev/docs/contract/declaration#request-model} */
			headers<const THeaders extends RequestHeadersSchema>(
				schema: THeaders,
			): RouteBuilderView<
				WithRequest<
					TState,
					"headers",
					TState["request"] extends {
						headers: infer TCommon extends RequestHeadersDeclaration;
					}
						? TCommon & { local: THeaders }
						: { local: THeaders },
					"headers"
				>,
				TExtension
			>;
		}
	> &
	WhenUnused<
		TState,
		"metadata",
		{
			/** Adds application metadata. @see {@link https://rest-rpc.dev/docs/contract/declaration#shared-route-options} */
			metadata<const TLocal extends RouteMetadata>(
				metadata: TLocal,
			): RouteBuilderView<WithMetadata<TState, TLocal>, TExtension>;
		}
	> &
	WhenUnused<
		TState,
		"openAPI",
		{
			/** Adds OpenAPI metadata. @see {@link https://rest-rpc.dev/docs/openapi#route-metadata} */
			openAPI(
				openApi: OpenApiRouteOptions,
			): RouteBuilderView<WithOpenApi<TState>, TExtension>;
		}
	>;

type HttpMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = ResponseMethods<TState, TExtension> &
	BodyMethods<TState, TExtension> &
	RequestMethods<TState, TExtension> &
	ApplyExtension<TState, TExtension>;

type ProcedureMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = WhenUnused<
	TState,
	"input",
	{
		/** Declares the procedure's JSON input schema. */
		input<const TSchema extends StandardSchemaV1>(
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "body", TSchema, "input">,
			TExtension
		>;
	}
> &
	WhenUnused<
		TState,
		"output",
		{
			/** Declares the procedure's JSON output schema. */
			output<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): RouteBuilderView<
				WithResponse<UseMethod<TState, "output">, 200, TSchema>,
				TExtension
			>;
		}
	> &
	ApplyExtension<TState, TExtension>;

type AvailableMethods<TState, TExtension> = TState extends BuilderState
	? TState["route"]["kind"] extends "procedure"
		? ProcedureMethods<TState, Extract<TExtension, BuilderExtension>>
		: HttpMethods<TState, Extract<TExtension, BuilderExtension>>
	: never;

/** Fluent type-level view over the loose route-builder runtime. */
export type RouteBuilderView<TState, TExtension = never> = {
	readonly "~restrpc": PublicDeclarationFor<TState>;
} & AvailableMethods<TState, TExtension>;

type OptionValue<TOptions, TKey extends PropertyKey, TFallback> =
	TOptions extends Record<TKey, infer TValue> ? TValue : TFallback;

type RequestFor<TOptions> = TOptions extends {
	headers: infer THeaders extends RequestHeadersSchema;
}
	? { headers: { inherited: THeaders } }
	: EmptyObject;

type PathFor<TOptions, TPath extends string> = TOptions extends {
	pathPrefix: infer TPrefix extends string;
}
	? `${TPrefix}${TPath}`
	: TPath;

type MetadataFor<TOptions> = TOptions extends {
	metadata: infer TMetadata extends RouteMetadata;
}
	? TMetadata
	: never;

type OpenApiFor<TOptions> = TOptions extends {
	openApi: CommonOpenApiRouteOptions;
}
	? OpenApiRouteOptions
	: never;

type HttpStateFor<
	TOptions,
	TMethod extends HttpMethod,
	TPath extends string,
> = {
	route: {
		readonly kind: "http";
		readonly method: TMethod;
		readonly path: PathFor<TOptions, TPath>;
	};
	request: RequestFor<TOptions>;
	responses: OptionValue<TOptions, "responses", EmptyObject>;
	metadata: MetadataFor<TOptions>;
	openApi: OpenApiFor<TOptions>;
	used: never;
};

type ProcedureState<TRequest, TResponses, TUsed extends BuilderMethod> = {
	route: {
		readonly kind: "procedure";
		readonly method: "POST";
		readonly path: "";
	};
	request: TRequest;
	responses: TResponses;
	metadata: never;
	openApi: never;
	used: TUsed;
};

type HttpRootMethods<TOptions, TExtension extends BuilderExtension | never> = {
	[TMethod in Lowercase<HttpMethod>]: <const TPath extends string>(
		path: TPath,
	) => RouteBuilderView<
		HttpStateFor<TOptions, Uppercase<TMethod> & HttpMethod, TPath>,
		TExtension
	>;
};

type ProcedureRootMethods<TExtension extends BuilderExtension | never> = {
	/** Declares the procedure's JSON input schema. */
	input<const TInput extends StandardSchemaV1>(
		schema: TInput,
	): RouteBuilderView<
		ProcedureState<{ body: TInput }, EmptyObject, "input">,
		TExtension
	>;
	/** Declares a no-input procedure with a `200` JSON response. */
	output<const TOutput extends StandardSchemaV1>(
		schema: TOutput,
	): RouteBuilderView<
		ProcedureState<EmptyObject, { 200: TOutput }, "output">,
		TExtension
	>;
} & ApplyExtension<ProcedureState<EmptyObject, EmptyObject, never>, TExtension>;

type RouteBuilderInput<TOptions extends RouteBuilderOptions> = TOptions & {
	[TKey in Extract<keyof TOptions, "strictStatusCodes">]: never;
};

/** Type-level view of the root route builder. */
export type RootRouteBuilder<
	TOptions = undefined,
	TExtension extends BuilderExtension | never = never,
> = {
	readonly "~restrpc": EmptyObject;
	/** Creates a builder with shared route options. */
	with<const TNextOptions extends RouteBuilderOptions>(
		options: RouteBuilderInput<TNextOptions>,
	): RootRouteBuilder<TNextOptions, TExtension>;
} & HttpRootMethods<TOptions, TExtension> &
	(TOptions extends undefined ? ProcedureRootMethods<TExtension> : EmptyObject);
