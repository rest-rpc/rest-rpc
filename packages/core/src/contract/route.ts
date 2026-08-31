import {
	isStandardSchema,
	type StandardSchemaV1,
} from "../standard-schema/index.ts";
import {
	customBody as declareCustomBody,
	formBody as declareFormBody,
	multipartBody as declareMultipartBody,
	noBody,
	stream as declareStream,
	type CustomBody,
	type CustomBodyContentType,
	type CustomResponseBody,
	type FormBody,
	type MultipartBody,
	type NoBody,
	type Stream,
} from "./body.ts";
import type {
	CommonOpenApiRouteOptions,
	HttpMethod,
	HttpRouteDeclaration,
	OpenApiResponseOptions,
	OpenApiRouteOptions,
	RouteFactoryOptions,
	RouteMetadata,
	RouteRequestDeclaration,
	RouteDeclaration,
} from "./contract.ts";
import { getPathParamNames } from "./path.ts";
import type { JsonQuery, RequestKeys, RequestSchemaRecord } from "./request.ts";
import { jsonQuery as declareJsonQuery } from "./request.ts";
import type {
	ResponseDeclaration,
	ResponseHeaders,
	RouteResponses,
} from "./response.ts";
import type { WebSocketMessageDeclaration } from "./websocketMessages.ts";

type RegularResponseDeclaration =
	| StandardSchemaV1
	| {
			body: StandardSchemaV1;
			headers: ResponseHeaders;
	  };

type BodyWithArrayKeysInput =
	| StandardSchemaV1
	| {
			schema: StandardSchemaV1;
			arrayKeys: readonly string[];
	  };

type CustomBodyInput =
	| StandardSchemaV1
	| {
			schema: StandardSchemaV1;
			contentType: CustomBodyContentType;
	  };

type CustomResponseInput = {
	schema: StandardSchemaV1;
	contentType: CustomBodyContentType;
};

type CustomResponseBodyFor<
	TSchema extends StandardSchemaV1,
	TContentType extends CustomBodyContentType,
> = CustomBody<TSchema, TContentType> & CustomResponseBody;

type BuilderState = {
	writes: Set<string>;
	responseStatuses: Set<number>;
};

const cloneMetadata = <T>(value: T): T => {
	if (Array.isArray(value)) return value.map(cloneMetadata) as T;
	if (
		typeof value !== "object" ||
		value === null ||
		isStandardSchema(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		return value;
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, nested]) => [key, cloneMetadata(nested)]),
	) as T;
};

const cloneResponses = (responses: RouteResponses | undefined) =>
	responses === undefined
		? undefined
		: (Object.fromEntries(
				Object.entries(responses).map(([status, response]) => [
					status,
					typeof response === "object" &&
					response !== null &&
					"headers" in response
						? {
								...response,
								headers: { ...response.headers },
							}
						: response,
				]),
			) as RouteResponses);

const mergeUnique = (common: string[] = [], local: string[] = []) => [
	...new Set([...common, ...local]),
];

const mergeOpenApiResponse = (
	common: OpenApiResponseOptions | undefined,
	local: OpenApiResponseOptions | undefined,
): OpenApiResponseOptions => ({
	...cloneMetadata(common),
	...cloneMetadata(local),
	...(common?.headers || local?.headers
		? { headers: { ...common?.headers, ...local?.headers } }
		: {}),
});

const mergeOpenApi = (
	common: CommonOpenApiRouteOptions | undefined,
	local: OpenApiRouteOptions | undefined,
): OpenApiRouteOptions | undefined => {
	if (!common && !local) return undefined;
	const statuses = new Set([
		...Object.keys(common?.responses ?? {}),
		...Object.keys(local?.responses ?? {}),
	]);
	return {
		...cloneMetadata(common),
		...cloneMetadata(local),
		...(common?.tags || local?.tags
			? { tags: mergeUnique(common?.tags, local?.tags) }
			: {}),
		...(common?.extensions || local?.extensions
			? {
					extensions: {
						...cloneMetadata(common?.extensions),
						...cloneMetadata(local?.extensions),
					},
				}
			: {}),
		...(statuses.size > 0
			? {
					responses: Object.fromEntries(
						[...statuses].map((status) => [
							status,
							mergeOpenApiResponse(
								common?.responses?.[Number(status)],
								local?.responses?.[Number(status)],
							),
						]),
					),
				}
			: {}),
	};
};

export const joinPathPrefix = (prefix: string, path: string) =>
	`${prefix}${path}`;

const assertStaticPathPrefix = (pathPrefix: string | undefined) => {
	if (pathPrefix && getPathParamNames(pathPrefix).length > 0) {
		throw new Error("Route factory pathPrefix cannot include path params.");
	}
};

class HttpRouteBuilder {
	declare method: HttpMethod;
	declare path: string;
	declare request?: HttpRouteDeclaration["request"];
	declare private _state: BuilderState;
	declare private _commonResponses?: RouteResponses;
	declare private _commonMetadata?: RouteMetadata;
	declare private _commonOpenApi?: CommonOpenApiRouteOptions;

	constructor(
		method: HttpMethod,
		path: string,
		options: RouteFactoryOptions = {},
	) {
		this.method = method;
		this.path = options.pathPrefix
			? joinPathPrefix(options.pathPrefix, path)
			: path;
		this.request =
			options.headers || typeof options.flattenRequestKeys === "boolean"
				? {
						...(options.headers ? { headers: { ...options.headers } } : {}),
						...(typeof options.flattenRequestKeys === "boolean"
							? { flattenKeys: options.flattenRequestKeys }
							: {}),
					}
				: undefined;
		Object.defineProperties(this, {
			_state: {
				value: { writes: new Set(), responseStatuses: new Set() },
				writable: true,
			},
			_commonResponses: { value: cloneResponses(options.responses) },
			_commonMetadata: { value: cloneMetadata(options.metadata) },
			_commonOpenApi: { value: cloneMetadata(options.openApi) },
		});
		if (options.responses) {
			Object.assign(this, { responses: cloneResponses(options.responses) });
		}
		this.installCallableDefault("metadata", cloneMetadata(options.metadata));
		this.installCallableDefault(
			"openApi",
			mergeOpenApi(options.openApi, undefined),
		);
	}

	private installCallableDefault(
		setter: "metadata" | "openApi",
		value: object | undefined,
	) {
		if (!value) return;
		const callable = Object.assign(
			(
				this[setter] as (value: RouteMetadata | OpenApiRouteOptions) => this
			).bind(this),
			value,
		);
		Object.defineProperty(this, setter, {
			value: callable,
			writable: true,
			enumerable: true,
			configurable: true,
		});
	}

	private assertSingleWrite(setter: string) {
		if (this._state.writes.has(setter)) {
			throw new Error(
				`Route ${this.method} ${this.path} cannot call ${setter}() more than once.`,
			);
		}
		this._state.writes.add(setter);
	}

	private requestForWrite() {
		return (this.request ??= {});
	}

	body(schema: StandardSchemaV1) {
		this.assertSingleWrite("body");
		this.requestForWrite().body = schema;
		return this;
	}

	formBody(input: BodyWithArrayKeysInput) {
		this.assertSingleWrite("body");
		this.requestForWrite().body = isStandardSchema(input)
			? declareFormBody(input)
			: declareFormBody(input);
		return this;
	}

	multipartBody(input: BodyWithArrayKeysInput) {
		this.assertSingleWrite("body");
		this.requestForWrite().body = isStandardSchema(input)
			? declareMultipartBody(input)
			: declareMultipartBody(input);
		return this;
	}

	customBody(input: CustomBodyInput) {
		this.assertSingleWrite("body");
		this.requestForWrite().body = isStandardSchema(input)
			? declareCustomBody(input)
			: declareCustomBody(input);
		return this;
	}

	query(schema: StandardSchemaV1) {
		this.assertSingleWrite("query");
		this.requestForWrite().query = schema;
		return this;
	}

	jsonQuery(schema: StandardSchemaV1) {
		this.assertSingleWrite("query");
		this.requestForWrite().query = declareJsonQuery(schema);
		return this;
	}

	pathParams(schema: StandardSchemaV1) {
		this.assertSingleWrite("pathParams");
		this.requestForWrite().pathParams = schema;
		return this;
	}

	headers(schemas: RequestSchemaRecord) {
		this.assertSingleWrite("headers");
		this.requestForWrite().headers = {
			...this.request?.headers,
			...schemas,
		};
		return this;
	}

	requestKeys(keys: RequestKeys) {
		this.assertSingleWrite("requestKeys");
		this.requestForWrite().keys = { ...keys };
		return this;
	}

	flattenRequestKeys(value: boolean) {
		this.assertSingleWrite("flattenRequestKeys");
		this.requestForWrite().flattenKeys = value;
		return this;
	}

	private addResponse(status: number, schema: ResponseDeclaration) {
		if (typeof status !== "number") {
			throw new Error("response() requires an explicit numeric status.");
		}
		if (this._state.responseStatuses.has(status)) {
			throw new Error(
				`Route ${this.method} ${this.path} already declares response status ${status}.`,
			);
		}
		this._state.responseStatuses.add(status);
		Object.assign(this, {
			responses: {
				...this._commonResponses,
				...(Object.hasOwn(this, "responses")
					? (this as unknown as HttpRouteDeclaration).responses
					: undefined),
				[status]: schema,
			},
		});
		return this;
	}

	response(status: number, schema?: RegularResponseDeclaration) {
		return this.addResponse(status, schema ?? noBody());
	}

	customResponse(status: number, input: CustomResponseInput) {
		return this.addResponse(status, declareCustomBody(input));
	}

	streamResponse(status: number, schema: StandardSchemaV1) {
		return this.addResponse(status, declareStream(schema));
	}

	customStreamResponse(status: number, input: CustomResponseInput) {
		return this.addResponse(status, declareStream(declareCustomBody(input)));
	}

	metadata(metadata: RouteMetadata) {
		this.assertSingleWrite("metadata");
		Object.assign(this, {
			metadata: {
				...cloneMetadata(this._commonMetadata),
				...cloneMetadata(metadata),
			},
		});
		return this;
	}

	openApi(openApi: OpenApiRouteOptions) {
		this.assertSingleWrite("openApi");
		Object.assign(this, {
			openApi: mergeOpenApi(this._commonOpenApi, openApi),
		});
		return this;
	}
}

class ProtocolRouteBuilder {
	declare method: "GET";
	declare path: string;
	declare mode: "sse" | "webSocket";
	declare request?: Omit<RouteRequestDeclaration, "body" | "headers">;
	declare protected _state: BuilderState;
	declare protected _commonMetadata?: RouteMetadata;
	declare protected _commonOpenApi?: CommonOpenApiRouteOptions;

	constructor(
		mode: "sse" | "webSocket",
		path: string,
		options: RouteFactoryOptions = {},
	) {
		this.method = "GET";
		this.path = options.pathPrefix
			? joinPathPrefix(options.pathPrefix, path)
			: path;
		this.mode = mode;
		this.request =
			typeof options.flattenRequestKeys === "boolean"
				? { flattenKeys: options.flattenRequestKeys }
				: undefined;
		Object.defineProperties(this, {
			_state: {
				value: { writes: new Set(), responseStatuses: new Set() },
				writable: true,
			},
			_commonMetadata: { value: cloneMetadata(options.metadata) },
			_commonOpenApi: { value: cloneMetadata(options.openApi) },
		});
		this.installCallableDefault("metadata", cloneMetadata(options.metadata));
		this.installCallableDefault(
			"openApi",
			mergeOpenApi(options.openApi, undefined),
		);
	}

	private installCallableDefault(
		setter: "metadata" | "openApi",
		value: object | undefined,
	) {
		if (!value) return;
		const callable = Object.assign(
			(
				this[setter] as (value: RouteMetadata | OpenApiRouteOptions) => this
			).bind(this),
			value,
		);
		Object.defineProperty(this, setter, {
			value: callable,
			writable: true,
			enumerable: true,
			configurable: true,
		});
	}

	protected assertSingleWrite(setter: string) {
		if (this._state.writes.has(setter)) {
			throw new Error(
				`Route ${this.method} ${this.path} cannot call ${setter}() more than once.`,
			);
		}
		this._state.writes.add(setter);
	}

	private requestForWrite() {
		return (this.request ??= {});
	}

	query(schema: StandardSchemaV1) {
		this.assertSingleWrite("query");
		this.requestForWrite().query = schema;
		return this;
	}

	jsonQuery(schema: StandardSchemaV1) {
		this.assertSingleWrite("query");
		this.requestForWrite().query = declareJsonQuery(schema);
		return this;
	}

	pathParams(schema: StandardSchemaV1) {
		this.assertSingleWrite("pathParams");
		this.requestForWrite().pathParams = schema;
		return this;
	}

	requestKeys(keys: RequestKeys) {
		this.assertSingleWrite("requestKeys");
		this.requestForWrite().keys = { ...keys };
		return this;
	}

	flattenRequestKeys(value: boolean) {
		this.assertSingleWrite("flattenRequestKeys");
		this.requestForWrite().flattenKeys = value;
		return this;
	}

	metadata(metadata: RouteMetadata) {
		this.assertSingleWrite("metadata");
		Object.assign(this, {
			metadata: {
				...cloneMetadata(this._commonMetadata),
				...cloneMetadata(metadata),
			},
		});
		return this;
	}

	openApi(openApi: OpenApiRouteOptions) {
		this.assertSingleWrite("openApi");
		Object.assign(this, {
			openApi: mergeOpenApi(this._commonOpenApi, openApi),
		});
		return this;
	}
}

class SseRouteBuilder extends ProtocolRouteBuilder {
	constructor(path: string, options?: RouteFactoryOptions) {
		super("sse", path, options);
	}

	response(schema: StandardSchemaV1) {
		this.assertSingleWrite("response");
		Object.assign(this, { response: schema });
		return this;
	}
}

class WebSocketRouteBuilder extends ProtocolRouteBuilder {
	constructor(path: string, options?: RouteFactoryOptions) {
		super("webSocket", path, options);
	}

	private setMessage(
		direction: "client" | "server",
		schema: WebSocketMessageDeclaration,
	) {
		Object.assign(this, {
			messages: {
				...((Object.hasOwn(this, "messages")
					? (this as unknown as { messages: object }).messages
					: {}) as object),
				[direction]: schema,
			},
		});
		return this;
	}

	clientMessages(schema: WebSocketMessageDeclaration) {
		this.assertSingleWrite("clientMessages");
		return this.setMessage("client", schema);
	}

	serverMessages(schema: WebSocketMessageDeclaration) {
		this.assertSingleWrite("serverMessages");
		return this.setMessage("server", schema);
	}
}

export const assertProtocolRouteComplete = (route: {
	method: HttpMethod;
	path: string;
	mode?: string;
}) => {
	if (route.mode === "sse" && !Object.hasOwn(route, "response")) {
		throw new Error(
			`SSE route declaration at path "${route.path}" is missing a response schema.`,
		);
	}
	if (route.mode === "webSocket") {
		const messages = Object.hasOwn(route, "messages")
			? (route as unknown as { messages: Record<string, unknown> }).messages
			: undefined;
		if (!messages?.client || !messages.server) {
			throw new Error(
				`WebSocket route declaration at path "${route.path}" must declare client and server messages.`,
			);
		}
	}
	return route as RouteDeclaration;
};

const createHttpRoute = (
	method: HttpMethod,
	path: string,
	options?: RouteFactoryOptions,
) => new HttpRouteBuilder(method, path, options);

type Simplify<T> = { [K in keyof T]: T[K] };
type EmptyObject = Record<never, never>;
type Merge<TCommon, TLocal> = Simplify<Omit<TCommon, keyof TLocal> & TLocal>;
type JoinPath<
	TPrefix extends string,
	TPath extends string,
> = `${TPrefix}${TPath}`;
type OptionValue<TOptions, TKey extends PropertyKey, TFallback> =
	TOptions extends Record<TKey, infer TValue> ? TValue : TFallback;
type PathFor<TOptions, TPath extends string> = TOptions extends {
	pathPrefix: infer TPrefix extends string;
}
	? JoinPath<TPrefix, TPath>
	: TPath;
type RequestFor<TOptions> = Simplify<
	(TOptions extends { headers: infer THeaders extends RequestSchemaRecord }
		? { headers: THeaders }
		: EmptyObject) &
		(TOptions extends { flattenRequestKeys: infer TFlatten extends boolean }
			? { flattenKeys: TFlatten }
			: EmptyObject)
>;
type WithRequest<
	TRequest,
	TKey extends keyof RouteRequestDeclaration,
	TValue,
> = Simplify<Omit<TRequest, TKey> & Record<TKey, TValue>>;
type LocalResponseStatus<
	TStatus extends number,
	TUsed extends number,
> = TStatus extends TUsed ? never : TStatus;

type HttpBuilder<
	TMethod extends HttpMethod,
	TPath extends string,
	TRequest,
	TResponses,
	TMetadata,
	TOpenApi,
	TUsed extends string = never,
	TLocalStatuses extends number = never,
> = Simplify<
	{
		readonly method: TMethod;
		readonly path: TPath;
	} & (keyof TRequest extends never
		? { request?: never }
		: { request: TRequest }) &
		(keyof TResponses extends never
			? { responses?: never }
			: { responses: TResponses }) & {
			response<const TStatus extends number>(
				status: LocalResponseStatus<TStatus, TLocalStatuses>,
			): HttpBuilder<
				TMethod,
				TPath,
				TRequest,
				Merge<TResponses, Record<TStatus, NoBody>>,
				TMetadata,
				TOpenApi,
				TUsed,
				TLocalStatuses | TStatus
			>;
			response<
				const TStatus extends number,
				const TSchema extends RegularResponseDeclaration,
			>(
				status: LocalResponseStatus<TStatus, TLocalStatuses>,
				schema: TSchema,
			): HttpBuilder<
				TMethod,
				TPath,
				TRequest,
				Merge<TResponses, Record<TStatus, TSchema>>,
				TMetadata,
				TOpenApi,
				TUsed,
				TLocalStatuses | TStatus
			>;
			customResponse<
				const TStatus extends number,
				const TSchema extends StandardSchemaV1,
				const TContentType extends CustomBodyContentType,
			>(
				status: LocalResponseStatus<TStatus, TLocalStatuses>,
				input: { schema: TSchema; contentType: TContentType },
			): HttpBuilder<
				TMethod,
				TPath,
				TRequest,
				Merge<
					TResponses,
					Record<TStatus, CustomResponseBodyFor<TSchema, TContentType>>
				>,
				TMetadata,
				TOpenApi,
				TUsed,
				TLocalStatuses | TStatus
			>;
			streamResponse<
				const TStatus extends number,
				const TSchema extends StandardSchemaV1,
			>(
				status: LocalResponseStatus<TStatus, TLocalStatuses>,
				schema: TSchema,
			): HttpBuilder<
				TMethod,
				TPath,
				TRequest,
				Merge<TResponses, Record<TStatus, Stream<TSchema>>>,
				TMetadata,
				TOpenApi,
				TUsed,
				TLocalStatuses | TStatus
			>;
			customStreamResponse<
				const TStatus extends number,
				const TSchema extends StandardSchemaV1,
				const TContentType extends CustomBodyContentType,
			>(
				status: LocalResponseStatus<TStatus, TLocalStatuses>,
				input: { schema: TSchema; contentType: TContentType },
			): HttpBuilder<
				TMethod,
				TPath,
				TRequest,
				Merge<
					TResponses,
					Record<TStatus, Stream<CustomResponseBodyFor<TSchema, TContentType>>>
				>,
				TMetadata,
				TOpenApi,
				TUsed,
				TLocalStatuses | TStatus
			>;
		} & ("body" extends TUsed
			? EmptyObject
			: {
					body<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "body", TSchema>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "body",
						TLocalStatuses
					>;
					formBody<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "body", FormBody<TSchema>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "body",
						TLocalStatuses
					>;
					formBody<
						const TSchema extends StandardSchemaV1,
						const TArrayKeys extends readonly string[],
					>(input: {
						schema: TSchema;
						arrayKeys: TArrayKeys;
					}): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "body", FormBody<TSchema, TArrayKeys>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "body",
						TLocalStatuses
					>;
					multipartBody<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "body", MultipartBody<TSchema>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "body",
						TLocalStatuses
					>;
					multipartBody<
						const TSchema extends StandardSchemaV1,
						const TArrayKeys extends readonly string[],
					>(input: {
						schema: TSchema;
						arrayKeys: TArrayKeys;
					}): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "body", MultipartBody<TSchema, TArrayKeys>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "body",
						TLocalStatuses
					>;
					customBody<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "body", CustomBody<TSchema, undefined>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "body",
						TLocalStatuses
					>;
					customBody<
						const TSchema extends StandardSchemaV1,
						const TContentType extends CustomBodyContentType,
					>(input: {
						schema: TSchema;
						contentType: TContentType;
					}): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "body", CustomBody<TSchema, TContentType>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "body",
						TLocalStatuses
					>;
				}) &
		("query" extends TUsed
			? EmptyObject
			: {
					query<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "query", TSchema>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "query",
						TLocalStatuses
					>;
					jsonQuery<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "query", JsonQuery<TSchema>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "query",
						TLocalStatuses
					>;
				}) &
		("pathParams" extends TUsed
			? EmptyObject
			: {
					pathParams<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "pathParams", TSchema>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "pathParams",
						TLocalStatuses
					>;
				}) &
		("headers" extends TUsed
			? EmptyObject
			: {
					headers<const THeaders extends RequestSchemaRecord>(
						headers: THeaders,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<
							TRequest,
							"headers",
							Merge<
								TRequest extends { headers: infer TCommon }
									? TCommon
									: EmptyObject,
								THeaders
							>
						>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "headers",
						TLocalStatuses
					>;
				}) &
		("requestKeys" extends TUsed
			? EmptyObject
			: {
					requestKeys<const TKeys extends RequestKeys>(
						keys: TKeys,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "keys", TKeys>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "requestKeys",
						TLocalStatuses
					>;
				}) &
		("flattenRequestKeys" extends TUsed
			? EmptyObject
			: {
					flattenRequestKeys<const TFlatten extends boolean>(
						value: TFlatten,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "flattenKeys", TFlatten>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "flattenRequestKeys",
						TLocalStatuses
					>;
				}) &
		("metadata" extends TUsed
			? { metadata: TMetadata }
			: {
					metadata: TMetadata &
						RouteMetadata &
						(<const TLocal extends RouteMetadata>(
							metadata: TLocal,
						) => HttpBuilder<
							TMethod,
							TPath,
							TRequest,
							TResponses,
							Merge<TMetadata, TLocal>,
							TOpenApi,
							TUsed | "metadata",
							TLocalStatuses
						>);
				}) &
		("openApi" extends TUsed
			? { openApi: TOpenApi }
			: {
					openApi: TOpenApi &
						OpenApiRouteOptions &
						(<const TLocal extends OpenApiRouteOptions>(
							openApi: TLocal,
						) => HttpBuilder<
							TMethod,
							TPath,
							TRequest,
							TResponses,
							TMetadata,
							Merge<TOpenApi, TLocal>,
							TUsed | "openApi",
							TLocalStatuses
						>);
				})
>;

type ProtocolRequestSetters<
	TKind extends "sse" | "webSocket",
	TPath extends string,
	TRequest,
	TMetadata,
	TOpenApi,
	TUsed extends string,
	TComplete,
> = ("query" extends TUsed
	? EmptyObject
	: {
			query<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): ProtocolBuilder<
				TKind,
				TPath,
				WithRequest<TRequest, "query", TSchema>,
				TMetadata,
				TOpenApi,
				TUsed | "query",
				TComplete
			>;
			jsonQuery<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): ProtocolBuilder<
				TKind,
				TPath,
				WithRequest<TRequest, "query", JsonQuery<TSchema>>,
				TMetadata,
				TOpenApi,
				TUsed | "query",
				TComplete
			>;
		}) &
	("pathParams" extends TUsed
		? EmptyObject
		: {
				pathParams<const TSchema extends StandardSchemaV1>(
					schema: TSchema,
				): ProtocolBuilder<
					TKind,
					TPath,
					WithRequest<TRequest, "pathParams", TSchema>,
					TMetadata,
					TOpenApi,
					TUsed | "pathParams",
					TComplete
				>;
			}) &
	("requestKeys" extends TUsed
		? EmptyObject
		: {
				requestKeys<const TKeys extends RequestKeys>(
					keys: TKeys,
				): ProtocolBuilder<
					TKind,
					TPath,
					WithRequest<TRequest, "keys", TKeys>,
					TMetadata,
					TOpenApi,
					TUsed | "requestKeys",
					TComplete
				>;
			}) &
	("flattenRequestKeys" extends TUsed
		? EmptyObject
		: {
				flattenRequestKeys<const TFlatten extends boolean>(
					value: TFlatten,
				): ProtocolBuilder<
					TKind,
					TPath,
					WithRequest<TRequest, "flattenKeys", TFlatten>,
					TMetadata,
					TOpenApi,
					TUsed | "flattenRequestKeys",
					TComplete
				>;
			}) &
	("metadata" extends TUsed
		? { metadata: TMetadata }
		: {
				metadata: TMetadata &
					RouteMetadata &
					(<const TLocal extends RouteMetadata>(
						metadata: TLocal,
					) => ProtocolBuilder<
						TKind,
						TPath,
						TRequest,
						Merge<TMetadata, TLocal>,
						TOpenApi,
						TUsed | "metadata",
						TComplete
					>);
			}) &
	("openApi" extends TUsed
		? { openApi: TOpenApi }
		: {
				openApi: TOpenApi &
					OpenApiRouteOptions &
					(<const TLocal extends OpenApiRouteOptions>(
						openApi: TLocal,
					) => ProtocolBuilder<
						TKind,
						TPath,
						TRequest,
						TMetadata,
						Merge<TOpenApi, TLocal>,
						TUsed | "openApi",
						TComplete
					>);
			});

type SseBuilder<
	TPath extends string,
	TRequest,
	TMetadata,
	TOpenApi,
	TUsed extends string = never,
	TResponse = never,
> = Simplify<
	{
		readonly method: "GET";
		readonly path: TPath;
		readonly mode: "sse";
	} & (keyof TRequest extends never
		? { request?: never }
		: { request: TRequest }) &
		([TResponse] extends [never]
			? {
					response<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): SseBuilder<TPath, TRequest, TMetadata, TOpenApi, TUsed, TSchema>;
				}
			: { response: TResponse }) &
		ProtocolRequestSetters<
			"sse",
			TPath,
			TRequest,
			TMetadata,
			TOpenApi,
			TUsed,
			TResponse
		>
>;

type WebSocketCompletion = {
	client?: WebSocketMessageDeclaration;
	server?: WebSocketMessageDeclaration;
};

type WebSocketBuilder<
	TPath extends string,
	TRequest,
	TMetadata,
	TOpenApi,
	TUsed extends string = never,
	TMessages extends WebSocketCompletion = EmptyObject,
> = Simplify<
	{
		readonly method: "GET";
		readonly path: TPath;
		readonly mode: "webSocket";
	} & (keyof TRequest extends never
		? { request?: never }
		: { request: TRequest }) &
		(keyof TMessages extends never
			? { messages?: never }
			: { messages: TMessages }) &
		(TMessages extends { client: WebSocketMessageDeclaration }
			? EmptyObject
			: {
					clientMessages<const TSchema extends WebSocketMessageDeclaration>(
						schema: TSchema,
					): WebSocketBuilder<
						TPath,
						TRequest,
						TMetadata,
						TOpenApi,
						TUsed,
						Merge<TMessages, { client: TSchema }>
					>;
				}) &
		(TMessages extends { server: WebSocketMessageDeclaration }
			? EmptyObject
			: {
					serverMessages<const TSchema extends WebSocketMessageDeclaration>(
						schema: TSchema,
					): WebSocketBuilder<
						TPath,
						TRequest,
						TMetadata,
						TOpenApi,
						TUsed,
						Merge<TMessages, { server: TSchema }>
					>;
				}) &
		ProtocolRequestSetters<
			"webSocket",
			TPath,
			TRequest,
			TMetadata,
			TOpenApi,
			TUsed,
			TMessages
		>
>;

type ProtocolBuilder<
	TKind extends "sse" | "webSocket",
	TPath extends string,
	TRequest,
	TMetadata,
	TOpenApi,
	TUsed extends string,
	TComplete,
> = TKind extends "sse"
	? SseBuilder<TPath, TRequest, TMetadata, TOpenApi, TUsed, TComplete>
	: WebSocketBuilder<
			TPath,
			TRequest,
			TMetadata,
			TOpenApi,
			TUsed,
			TComplete extends WebSocketCompletion ? TComplete : EmptyObject
		>;

type HttpBuilderFor<
	TOptions,
	TMethod extends HttpMethod,
	TPath extends string,
> = HttpBuilder<
	TMethod,
	PathFor<TOptions, TPath>,
	RequestFor<TOptions>,
	OptionValue<TOptions, "responses", EmptyObject>,
	OptionValue<TOptions, "metadata", EmptyObject>,
	OptionValue<TOptions, "openApi", EmptyObject>
>;

type RouteFactory<TOptions = undefined> = {
	get<const TPath extends string>(
		path: TPath,
	): HttpBuilderFor<TOptions, "GET", TPath>;
	post<const TPath extends string>(
		path: TPath,
	): HttpBuilderFor<TOptions, "POST", TPath>;
	put<const TPath extends string>(
		path: TPath,
	): HttpBuilderFor<TOptions, "PUT", TPath>;
	patch<const TPath extends string>(
		path: TPath,
	): HttpBuilderFor<TOptions, "PATCH", TPath>;
	delete<const TPath extends string>(
		path: TPath,
	): HttpBuilderFor<TOptions, "DELETE", TPath>;
	sse<const TPath extends string>(
		path: TPath,
	): SseBuilder<
		PathFor<TOptions, TPath>,
		RequestFor<TOptions>,
		OptionValue<TOptions, "metadata", EmptyObject>,
		OptionValue<TOptions, "openApi", EmptyObject>
	>;
	ws<const TPath extends string>(
		path: TPath,
	): WebSocketBuilder<
		PathFor<TOptions, TPath>,
		RequestFor<TOptions>,
		OptionValue<TOptions, "metadata", EmptyObject>,
		OptionValue<TOptions, "openApi", EmptyObject>
	>;
};

const createFactory = (options: RouteFactoryOptions = {}) => {
	assertStaticPathPrefix(options.pathPrefix);
	return {
		get: (path: string) => createHttpRoute("GET", path, options),
		post: (path: string) => createHttpRoute("POST", path, options),
		put: (path: string) => createHttpRoute("PUT", path, options),
		patch: (path: string) => createHttpRoute("PATCH", path, options),
		delete: (path: string) => createHttpRoute("DELETE", path, options),
		sse: (path: string) => new SseRouteBuilder(path, options),
		ws: (path: string) => new WebSocketRouteBuilder(path, options),
	};
};

/** Route-first contract declaration factory. */
export const route = {
	...createFactory(),
	with<const TOptions extends RouteFactoryOptions>(options: TOptions) {
		return createFactory(options);
	},
} as unknown as RouteFactory & {
	with<const TOptions extends RouteFactoryOptions>(
		options: TOptions,
	): RouteFactory<TOptions>;
};
