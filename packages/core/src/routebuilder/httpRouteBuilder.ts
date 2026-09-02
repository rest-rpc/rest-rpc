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
} from "../contract/body.ts";
import type {
	HttpMethod,
	HttpRouteDeclaration,
	OpenApiRouteOptions,
	RouteFactoryOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "../contract/contract.ts";
import type {
	JsonQuery,
	RequestHeadersDeclaration,
	RequestHeadersSchema,
	RequestKeys,
	RequestParamsSchema,
	RequestQuerySchema,
} from "../contract/request.ts";
import type {
	RegularResponseDeclaration,
	ResponseDeclaration,
	RouteResponses,
} from "../contract/response.ts";
import {
	BaseRouteBuilder,
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

type HttpRouteFor<TOptions, TMethod extends HttpMethod> = {
	readonly method: TMethod;
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

class HttpRouteBuilder extends BaseRouteBuilder {
	#localResponseStatuses = new Set<number>();
	declare method: HttpMethod;
	declare path: string;
	declare request?: HttpRouteDeclaration["request"];
	declare responses?: RouteResponses;

	constructor(
		method: HttpMethod,
		path: string,
		options: RouteFactoryOptions = {},
	) {
		super(method, path, options, httpRequestDefaults(options));
		if (typeof options.strictStatusCodes === "boolean") {
			Object.assign(this, { strictStatusCodes: options.strictStatusCodes });
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

type HttpBuilderState = BuilderState<unknown, HttpBuilderMethod> & {
	route: { readonly method: HttpMethod };
	responses: unknown;
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

type HttpBuilderDeclaration<TState extends HttpBuilderState> = {
	readonly path: string;
} & TState["route"] &
	(keyof TState["request"] extends never
		? { request?: never }
		: { request: TState["request"] }) &
	(keyof TState["responses"] extends never
		? { responses?: never }
		: { responses: TState["responses"] });

/** A completed HTTP route declaration with its inferred request and responses. */
export type FinalizedHttpRoute<TRoute, TRequest, TResponses, TUsed> = {
	readonly path: string;
} & TRoute &
	(keyof TRequest extends never
		? { request?: never }
		: { request: TRequest }) & {
		responses: TResponses;
	} & ("withMetadata" extends TUsed
		? { metadata: RouteMetadata }
		: Record<never, never>) &
	("withOpenApi" extends TUsed
		? { openApi: OpenApiRouteOptions }
		: Record<never, never>);

type HttpFinalize<TState extends HttpBuilderState> =
	keyof TState["responses"] extends never
		? EmptyObject
		: {
				finalize(): FinalizedHttpRoute<
					{ [TKey in keyof TState["route"]]: TState["route"][TKey] },
					{ [TKey in keyof TState["request"]]: TState["request"][TKey] },
					{ [TKey in keyof TState["responses"]]: TState["responses"][TKey] },
					TState["used"]
				>;
			};

type HttpResponseSetters<TState extends HttpBuilderState> = {
	response<
		const TStatus extends number,
		const TSchema extends RegularResponseDeclaration | undefined = undefined,
	>(
		status: TStatus,
		schema?: TSchema,
	): HttpBuilder<
		WithResponse<
			TState,
			TStatus,
			TSchema extends RegularResponseDeclaration ? TSchema : NoBody
		>
	>;
	customResponse<
		const TStatus extends number,
		const TSchema extends StandardSchemaV1,
		const TContentType extends CustomBodyContentType,
	>(
		status: TStatus,
		input: CustomResponseInput<TSchema, TContentType>,
	): HttpBuilder<
		WithResponse<TState, TStatus, CustomResponseBody<TSchema, TContentType>>
	>;
	streamResponse<
		const TStatus extends number,
		const TSchema extends StandardSchemaV1,
	>(
		status: TStatus,
		schema: TSchema,
	): HttpBuilder<WithResponse<TState, TStatus, Stream<TSchema>>>;
	customStreamResponse<
		const TStatus extends number,
		const TSchema extends StandardSchemaV1,
		const TContentType extends CustomBodyContentType,
	>(
		status: TStatus,
		input: CustomResponseInput<TSchema, TContentType>,
	): HttpBuilder<
		WithResponse<
			TState,
			TStatus,
			Stream<CustomResponseBody<TSchema, TContentType>>
		>
	>;
};

type HttpBodySetters<TState extends HttpBuilderState> = WhenUnused<
	TState,
	"body",
	{
		body<const TSchema extends StandardSchemaV1>(
			schema: TSchema,
		): HttpBuilder<SetHttpRequest<TState, "body", TSchema, "body">>;
		formBody<const TSchema extends FormBodySchema>(
			schema: TSchema,
		): HttpBuilder<SetHttpRequest<TState, "body", FormBody<TSchema>, "body">>;
		formBody<
			const TSchema extends FormBodySchema,
			const TArrayKeys extends readonly string[],
		>(
			input: BodyWithArrayKeysOptions<TSchema, TArrayKeys>,
		): HttpBuilder<
			SetHttpRequest<TState, "body", FormBody<TSchema, TArrayKeys>, "body">
		>;
		multipartBody<const TSchema extends MultipartBodySchema>(
			schema: TSchema,
		): HttpBuilder<
			SetHttpRequest<TState, "body", MultipartBody<TSchema>, "body">
		>;
		multipartBody<
			const TSchema extends MultipartBodySchema,
			const TArrayKeys extends readonly string[],
		>(
			input: BodyWithArrayKeysOptions<TSchema, TArrayKeys>,
		): HttpBuilder<
			SetHttpRequest<TState, "body", MultipartBody<TSchema, TArrayKeys>, "body">
		>;
		customBody<const TSchema extends StandardSchemaV1>(
			schema: TSchema,
		): HttpBuilder<
			SetHttpRequest<TState, "body", CustomBody<TSchema, undefined>, "body">
		>;
		customBody<
			const TSchema extends StandardSchemaV1,
			const TContentType extends CustomBodyContentType,
		>(
			input: CustomResponseInput<TSchema, TContentType>,
		): HttpBuilder<
			SetHttpRequest<TState, "body", CustomBody<TSchema, TContentType>, "body">
		>;
	}
>;

type HttpRequestSetters<TState extends HttpBuilderState> = WhenUnused<
	TState,
	"query",
	{
		query<const TSchema extends RequestQuerySchema>(
			schema: TSchema,
		): HttpBuilder<SetHttpRequest<TState, "query", TSchema, "query">>;
		jsonQuery<const TSchema extends StandardSchemaV1>(
			schema: TSchema,
		): HttpBuilder<
			SetHttpRequest<TState, "query", JsonQuery<TSchema>, "query">
		>;
	}
> &
	WhenUnused<
		TState,
		"params",
		{
			params<const TSchema extends RequestParamsSchema>(
				schema: TSchema,
			): HttpBuilder<SetHttpRequest<TState, "params", TSchema, "params">>;
		}
	> &
	WhenUnused<
		TState,
		"headers",
		{
			headers<const THeaders extends RequestHeadersSchema>(
				schema: THeaders,
			): HttpBuilder<
				SetHttpRequest<
					TState,
					"headers",
					TState["request"] extends {
						headers: infer TCommon extends RequestHeadersDeclaration;
					}
						? TCommon & { local: THeaders }
						: { local: THeaders },
					"headers"
				>
			>;
		}
	> &
	WhenUnused<
		TState,
		"requestKeys",
		{
			requestKeys<const TKeys extends RequestKeys>(
				keys: TKeys,
			): HttpBuilder<SetHttpRequest<TState, "keys", TKeys, "requestKeys">>;
		}
	> &
	("withMetadata" extends TState["used"]
		? { metadata: RouteMetadata }
		: {
				withMetadata(
					metadata: RouteMetadata,
				): HttpBuilder<UseBuilderMethod<TState, "withMetadata">>;
			}) &
	("withOpenApi" extends TState["used"]
		? { openApi: OpenApiRouteOptions }
		: {
				withOpenApi(
					openApi: OpenApiRouteOptions,
				): HttpBuilder<UseBuilderMethod<TState, "withOpenApi">>;
			});

type HttpBuilder<TState extends HttpBuilderState> =
	HttpBuilderDeclaration<TState> &
		HttpResponseSetters<TState> &
		HttpBodySetters<TState> &
		HttpRequestSetters<TState> &
		HttpFinalize<TState>;

export type HttpBuilderFor<TOptions, TMethod extends HttpMethod> = HttpBuilder<{
	route: HttpRouteFor<TOptions, TMethod>;
	request: RequestFor<TOptions>;
	responses: OptionValue<TOptions, "responses", EmptyObject>;
	used: never;
}>;

export const createHttpRoute = (
	method: HttpMethod,
	path: string,
	options?: RouteFactoryOptions,
) => new HttpRouteBuilder(method, path, options);
