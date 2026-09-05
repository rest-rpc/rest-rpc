import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import {
	resolveBodyWithArrayKeys,
	type BodyWithArrayKeysInput,
	type BodyWithArrayKeysOptions,
	type CustomBody,
	type CustomBodyInput,
	type CustomBodyContentType,
	type CustomResponseBody,
	type CustomResponseInput,
	type FormBody,
	type FormBodySchema,
	type MultipartBody,
	type MultipartBodySchema,
	type NoBody,
	type Stream,
} from "./body.ts";
import type {
	HttpMethod,
	BaseRouteDeclaration,
	OpenApiRouteOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "./baseRouteDeclaration.ts";
import type { RouteFactoryOptions } from "./routeFactory.ts";
import type {
	JsonQuery,
	RequestHeadersDeclaration,
	RequestHeadersSchema,
	RequestKeys,
	RequestParamsSchema,
	RequestQuerySchema,
} from "./request.ts";
import type {
	RegularResponseDeclaration,
	ResponseDeclaration,
	RouteResponses,
} from "./response.ts";
import {
	type ApplyBuilderExtension,
	BaseRouteBuilder,
	type BuilderExtension,
	type BuilderState,
	type EmptyObject,
	type UseBuilderMethod,
	type WhenUnused,
	type WithRequest,
} from "./baseRouteBuilder.ts";

type OptionValue<TOptions, TKey extends PropertyKey, TFallback> =
	TOptions extends Record<TKey, infer TValue> ? TValue : TFallback;

type RequestFor<TOptions> = (TOptions extends {
	headers: infer THeaders extends RequestHeadersSchema;
}
	? { headers: { inherited: THeaders } }
	: EmptyObject) &
	(TOptions extends { flattenRequestKeys: infer TFlatten extends boolean }
		? { flattenKeys: TFlatten }
		: EmptyObject);

type ResolvedPath<TOptions, TPath extends string> = TOptions extends {
	pathPrefix: infer TPrefix extends string;
}
	? `${TPrefix}${TPath}`
	: TPath;

type HttpRouteFor<TOptions, TMethod extends HttpMethod> = {
	readonly method: TMethod;
	readonly strictStatusCodes?: boolean;
} & (TOptions extends {
	strictStatusCodes: infer TStrictStatusCodes extends boolean;
}
	? { readonly strictStatusCodes: TStrictStatusCodes }
	: EmptyObject);

const httpRequestDefaults = (
	options: RouteFactoryOptions,
): RouteRequestDeclaration | undefined =>
	options.headers || typeof options.flattenRequestKeys === "boolean"
		? {
				...(options.headers ? { headers: { inherited: options.headers } } : {}),
				...(typeof options.flattenRequestKeys === "boolean"
					? { flattenKeys: options.flattenRequestKeys }
					: {}),
			}
		: undefined;

/** A canonical ordinary HTTP route declaration. */
export type HttpRouteDeclaration = BaseRouteDeclaration & {
	mode?: "http";
	responses: RouteResponses;
	messages?: never;
};

class HttpRouteBuilder extends BaseRouteBuilder {
	#localResponseStatuses = new Set<number>();
	declare method: HttpMethod;
	declare path: string;
	declare strictStatusCodes?: boolean;
	declare request?: HttpRouteDeclaration["request"];
	declare responses?: RouteResponses;

	constructor(
		method: HttpMethod,
		path: string,
		options: RouteFactoryOptions = {},
	) {
		super(method, path, options, httpRequestDefaults(options));
		if (typeof options.strictStatusCodes === "boolean") {
			this.strictStatusCodes = options.strictStatusCodes;
		}
		if (options.responses) {
			this.responses = { ...options.responses };
		}
	}

	body(schema: StandardSchemaV1) {
		this.requestForWrite().body = schema;
		this.recalculateRequestKeys();
		return this;
	}

	formBody(input: BodyWithArrayKeysInput<FormBodySchema>) {
		this.requestForWrite().body = {
			kind: "formBody",
			...resolveBodyWithArrayKeys(input),
		};
		this.recalculateRequestKeys();
		return this;
	}

	multipartBody(input: BodyWithArrayKeysInput<MultipartBodySchema>) {
		this.requestForWrite().body = {
			kind: "multipartBody",
			...resolveBodyWithArrayKeys(input),
		};
		this.recalculateRequestKeys();
		return this;
	}

	customBody(input: CustomBodyInput) {
		this.requestForWrite().body =
			"~standard" in input
				? { kind: "customBody", schema: input }
				: { kind: "customBody", ...input };
		this.recalculateRequestKeys();
		return this;
	}

	headers(schema: RequestHeadersSchema) {
		const request = this.requestForWrite();
		request.headers = { ...request.headers, local: schema };
		this.recalculateRequestKeys();
		return this;
	}

	private addResponse(status: number, schema: ResponseDeclaration) {
		if (this.#localResponseStatuses.has(status)) {
			throw new Error(
				`Route declaration at path "${this.path}" has duplicate response status "${status}".`,
			);
		}
		this.#localResponseStatuses.add(status);
		this.responses = {
			...this.responses,
			[status]: schema,
		};
		return this;
	}

	response(status: number, schema?: RegularResponseDeclaration) {
		return this.addResponse(status, schema ?? { kind: "noBody" });
	}

	customResponse(status: number, input: CustomResponseInput) {
		return this.addResponse(status, { kind: "customBody", ...input });
	}

	streamResponse(status: number, schema: StandardSchemaV1) {
		return this.addResponse(status, { kind: "stream", schema });
	}

	customStreamResponse(status: number, input: CustomResponseInput) {
		return this.addResponse(status, {
			kind: "stream",
			schema: { kind: "customBody", ...input },
		});
	}
}

type HttpBuilderMethod =
	| "body"
	| "query"
	| "params"
	| "headers"
	| "requestKeys"
	| "withMetadata"
	| "withOpenApi";

/** Type state carried by an ordinary HTTP route builder. */
export type HttpBuilderState = BuilderState<unknown, HttpBuilderMethod> & {
	route: { readonly method: HttpMethod };
	responses: unknown;
	extension: BuilderExtension | never;
};

type SetHttpRequest<
	TState extends HttpBuilderState,
	TKey extends keyof RouteRequestDeclaration,
	TValue,
	TMethod extends HttpBuilderMethod,
> = UseBuilderMethod<WithRequest<TState, TKey, TValue>, TMethod>;

type WithResponse<
	TState extends HttpBuilderState,
	TStatus extends PropertyKey,
	TResponse,
> = Omit<TState, "responses"> & {
	responses: TState["responses"] & Record<TStatus, TResponse>;
};

/** Resolves the route declaration represented by an HTTP builder state. */
export type HttpBuilderDeclaration<TState extends HttpBuilderState> = {
	readonly path: string;
} & TState["route"] &
	(keyof TState["request"] extends never
		? { request?: never }
		: { request: TState["request"] }) &
	(keyof TState["responses"] extends never
		? { responses?: never }
		: { responses: TState["responses"] });

/** An HTTP builder paired with its resolved literal path. */
export type HttpBuilderAtPath<
	TState extends HttpBuilderState,
	TPath extends string,
> = HttpBuilder<TState> & { readonly path: TPath } & ApplyBuilderExtension<
		TState["extension"],
		TState,
		TPath
	>;

type HttpResponseSetters<TState extends HttpBuilderState> = {
	/** Declares a response status and schema. @see {@link https://rest-rpc.dev/docs/contract/declaration#responses} */
	response<
		const TStatus extends number,
		const TSchema extends RegularResponseDeclaration | undefined = undefined,
		const TPath extends string = string,
	>(
		this: { readonly path: TPath },
		status: TStatus,
		schema?: TSchema,
	): HttpBuilderAtPath<
		WithResponse<
			TState,
			TStatus,
			TSchema extends RegularResponseDeclaration ? TSchema : NoBody
		>,
		TPath
	>;
	/** Declares a custom-content response. @see {@link https://rest-rpc.dev/docs/http-responses#response-with-custom-content-type} */
	customResponse<
		const TStatus extends number,
		const TSchema extends StandardSchemaV1,
		const TContentType extends CustomBodyContentType,
		const TPath extends string = string,
	>(
		this: { readonly path: TPath },
		status: TStatus,
		input: CustomResponseInput<TSchema, TContentType>,
	): HttpBuilderAtPath<
		WithResponse<TState, TStatus, CustomResponseBody<TSchema, TContentType>>,
		TPath
	>;
	/** Declares an NDJSON response stream. @see {@link https://rest-rpc.dev/docs/http-responses#streaming-ndjson-responses} */
	streamResponse<
		const TStatus extends number,
		const TSchema extends StandardSchemaV1,
		const TPath extends string = string,
	>(
		this: { readonly path: TPath },
		status: TStatus,
		schema: TSchema,
	): HttpBuilderAtPath<WithResponse<TState, TStatus, Stream<TSchema>>, TPath>;
	/** Declares a custom-content response stream. @see {@link https://rest-rpc.dev/docs/http-responses#streaming-responses-with-custom-content-type} */
	customStreamResponse<
		const TStatus extends number,
		const TSchema extends StandardSchemaV1,
		const TContentType extends CustomBodyContentType,
		const TPath extends string = string,
	>(
		this: { readonly path: TPath },
		status: TStatus,
		input: CustomResponseInput<TSchema, TContentType>,
	): HttpBuilderAtPath<
		WithResponse<
			TState,
			TStatus,
			Stream<CustomResponseBody<TSchema, TContentType>>
		>,
		TPath
	>;
};

type HttpBodySetters<TState extends HttpBuilderState> = WhenUnused<
	TState,
	"body",
	{
		/** Declares a JSON request body. @see {@link https://rest-rpc.dev/docs/http-requests#request-with-json-body} */
		body<
			const TSchema extends StandardSchemaV1,
			const TPath extends string = string,
		>(
			this: { readonly path: TPath },
			schema: TSchema,
		): HttpBuilderAtPath<
			SetHttpRequest<TState, "body", TSchema, "body">,
			TPath
		>;
		/** Declares a URL-encoded form body. @see {@link https://rest-rpc.dev/docs/http-requests#request-with-form-body} */
		formBody<
			const TSchema extends FormBodySchema,
			const TPath extends string = string,
		>(
			this: { readonly path: TPath },
			schema: TSchema,
		): HttpBuilderAtPath<
			SetHttpRequest<TState, "body", FormBody<TSchema>, "body">,
			TPath
		>;
		formBody<
			const TSchema extends FormBodySchema,
			const TArrayKeys extends readonly string[],
			const TPath extends string = string,
		>(
			this: { readonly path: TPath },
			input: BodyWithArrayKeysOptions<TSchema, TArrayKeys>,
		): HttpBuilderAtPath<
			SetHttpRequest<TState, "body", FormBody<TSchema, TArrayKeys>, "body">,
			TPath
		>;
		/** Declares a multipart form body. @see {@link https://rest-rpc.dev/docs/http-requests#request-with-multipart-body} */
		multipartBody<
			const TSchema extends MultipartBodySchema,
			const TPath extends string = string,
		>(
			this: { readonly path: TPath },
			schema: TSchema,
		): HttpBuilderAtPath<
			SetHttpRequest<TState, "body", MultipartBody<TSchema>, "body">,
			TPath
		>;
		multipartBody<
			const TSchema extends MultipartBodySchema,
			const TArrayKeys extends readonly string[],
			const TPath extends string = string,
		>(
			this: { readonly path: TPath },
			input: BodyWithArrayKeysOptions<TSchema, TArrayKeys>,
		): HttpBuilderAtPath<
			SetHttpRequest<
				TState,
				"body",
				MultipartBody<TSchema, TArrayKeys>,
				"body"
			>,
			TPath
		>;
		/** Declares a custom-content request body. @see {@link https://rest-rpc.dev/docs/http-requests#request-with-custom-content-type} */
		customBody<
			const TSchema extends StandardSchemaV1,
			const TPath extends string = string,
		>(
			this: { readonly path: TPath },
			schema: TSchema,
		): HttpBuilderAtPath<
			SetHttpRequest<TState, "body", CustomBody<TSchema, undefined>, "body">,
			TPath
		>;
		customBody<
			const TSchema extends StandardSchemaV1,
			const TContentType extends CustomBodyContentType,
			const TPath extends string = string,
		>(
			this: { readonly path: TPath },
			input: CustomResponseInput<TSchema, TContentType>,
		): HttpBuilderAtPath<
			SetHttpRequest<TState, "body", CustomBody<TSchema, TContentType>, "body">,
			TPath
		>;
	}
>;

type HttpRequestSetters<TState extends HttpBuilderState> = WhenUnused<
	TState,
	"query",
	{
		/** Declares URL query parameters. @see {@link https://rest-rpc.dev/docs/contract/declaration#request-model} */
		query<
			const TSchema extends RequestQuerySchema,
			const TPath extends string = string,
		>(
			this: { readonly path: TPath },
			schema: TSchema,
		): HttpBuilderAtPath<
			SetHttpRequest<TState, "query", TSchema, "query">,
			TPath
		>;
		/** Declares a JSON-encoded query value. @see {@link https://rest-rpc.dev/docs/contract/declaration#json-query} */
		jsonQuery<
			const TSchema extends StandardSchemaV1,
			const TPath extends string = string,
		>(
			this: { readonly path: TPath },
			schema: TSchema,
		): HttpBuilderAtPath<
			SetHttpRequest<TState, "query", JsonQuery<TSchema>, "query">,
			TPath
		>;
	}
> &
	WhenUnused<
		TState,
		"params",
		{
			/** Declares path parameters. @see {@link https://rest-rpc.dev/docs/contract/declaration#path-params} */
			params<
				const TSchema extends RequestParamsSchema,
				const TPath extends string = string,
			>(
				this: { readonly path: TPath },
				schema: TSchema,
			): HttpBuilderAtPath<
				SetHttpRequest<TState, "params", TSchema, "params">,
				TPath
			>;
		}
	> &
	WhenUnused<
		TState,
		"headers",
		{
			/** Declares request headers. @see {@link https://rest-rpc.dev/docs/contract/declaration#request-model} */
			headers<
				const THeaders extends RequestHeadersSchema,
				const TPath extends string = string,
			>(
				this: { readonly path: TPath },
				schema: THeaders,
			): HttpBuilderAtPath<
				SetHttpRequest<
					TState,
					"headers",
					TState["request"] extends {
						headers: infer TCommon extends RequestHeadersDeclaration;
					}
						? TCommon & { local: THeaders }
						: { local: THeaders },
					"headers"
				>,
				TPath
			>;
		}
	> &
	WhenUnused<
		TState,
		"requestKeys",
		{
			/** Maps flattened request keys. @see {@link https://rest-rpc.dev/docs/contract/declaration#flattened-key-collisions} */
			requestKeys<
				const TKeys extends RequestKeys,
				const TPath extends string = string,
			>(
				this: { readonly path: TPath },
				keys: TKeys,
			): HttpBuilderAtPath<
				SetHttpRequest<TState, "keys", TKeys, "requestKeys">,
				TPath
			>;
		}
	> &
	("withMetadata" extends TState["used"]
		? { metadata: RouteMetadata }
		: {
				/** Adds application metadata. @see {@link https://rest-rpc.dev/docs/contract/declaration#shared-route-options} */
				withMetadata<const TPath extends string>(
					this: { readonly path: TPath },
					metadata: RouteMetadata,
				): HttpBuilderAtPath<UseBuilderMethod<TState, "withMetadata">, TPath>;
			}) &
	("withOpenApi" extends TState["used"]
		? { openApi: OpenApiRouteOptions }
		: {
				/** Adds OpenAPI metadata. @see {@link https://rest-rpc.dev/docs/openapi#route-metadata} */
				withOpenApi<const TPath extends string>(
					this: { readonly path: TPath },
					openApi: OpenApiRouteOptions,
				): HttpBuilderAtPath<UseBuilderMethod<TState, "withOpenApi">, TPath>;
			});

export type HttpBuilder<TState extends HttpBuilderState> =
	HttpBuilderDeclaration<TState> &
		HttpResponseSetters<TState> &
		HttpBodySetters<TState> &
		HttpRequestSetters<TState>;

/** Creates the initial HTTP builder type for route factory options and a method. */
export type HttpBuilderFor<
	TOptions,
	TMethod extends HttpMethod,
	TPath extends string = string,
	TExtension extends BuilderExtension | never = never,
> = HttpBuilderAtPath<
	{
		route: HttpRouteFor<TOptions, TMethod>;
		request: RequestFor<TOptions>;
		responses: OptionValue<TOptions, "responses", EmptyObject>;
		used: never;
		extension: TExtension;
	},
	ResolvedPath<TOptions, TPath>
>;

export const createHttpRoute = (
	method: HttpMethod,
	path: string,
	options?: RouteFactoryOptions,
) => new HttpRouteBuilder(method, path, options);
