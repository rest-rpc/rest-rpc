import {
	isStandardSchema,
	type StandardSchemaV1,
} from "../standard-schema/index.ts";
import type {
	CommonOpenApiRouteOptions,
	HttpMethod,
	HttpRouteDeclaration,
	OpenApiResponseOptions,
	OpenApiRouteOptions,
	RouteFactoryOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "./contract.ts";
import { noBody, type NoBody } from "./body.ts";
import { getPathParamNames } from "./path.ts";
import type {
	JsonQuery,
	RequestBodySchema,
	RequestKeys,
	RequestSchemaRecord,
} from "./request.ts";
import type { ResponseDeclaration, RouteResponses } from "./response.ts";

type QuerySchema =
	| StandardSchemaV1
	| RequestSchemaRecord
	| JsonQuery;

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
		: Object.fromEntries(
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
			) as RouteResponses;

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

export const joinPathPrefix = (prefix: string, path: string) => `${prefix}${path}`;

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

	constructor(method: HttpMethod, path: string, options: RouteFactoryOptions = {}) {
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
				this[setter] as (
					value: RouteMetadata | OpenApiRouteOptions,
				) => this
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

	body(schema: RequestBodySchema) {
		this.assertSingleWrite("body");
		this.requestForWrite().body = schema;
		return this;
	}

	query(schema: QuerySchema) {
		this.assertSingleWrite("query");
		this.requestForWrite().query = schema;
		return this;
	}

	pathParams(schema: RequestSchemaRecord | StandardSchemaV1) {
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

	response(status: number, schema: ResponseDeclaration = noBody()) {
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
				...((Object.hasOwn(this, "responses")
					? (this as unknown as HttpRouteDeclaration).responses
					: undefined) ?? {}),
				[status]: schema,
			},
		});
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
		Object.assign(this, { openApi: mergeOpenApi(this._commonOpenApi, openApi) });
		return this;
	}
}

const createHttpRoute = (
	method: HttpMethod,
	path: string,
	options?: RouteFactoryOptions,
) => new HttpRouteBuilder(method, path, options);

type Simplify<T> = { [K in keyof T]: T[K] };
type EmptyObject = Record<never, never>;
type Merge<TCommon, TLocal> = Simplify<
	Omit<TCommon, keyof TLocal> & TLocal
>;
type JoinPath<TPrefix extends string, TPath extends string> =
	`${TPrefix}${TPath}`;
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
type LocalResponseStatus<TStatus extends number, TUsed extends number> =
	TStatus extends TUsed ? never : TStatus;

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
		request?: keyof TRequest extends never ? never : TRequest;
	} &
		(keyof TResponses extends never
			? { responses?: never }
			: { responses: TResponses }) &
		{
			response<
				const TStatus extends number,
				const TSchema extends ResponseDeclaration | undefined = undefined,
			>(
				status: LocalResponseStatus<TStatus, TLocalStatuses>,
				schema?: TSchema,
			): HttpBuilder<
				TMethod,
				TPath,
				TRequest,
				Merge<
					TResponses,
					Record<
						TStatus,
						TSchema extends ResponseDeclaration ? TSchema : NoBody
					>
				>,
				TMetadata,
				TOpenApi,
				TUsed,
				TLocalStatuses | TStatus
			>;
		} &
		("body" extends TUsed
			? EmptyObject
			: {
					body<const TSchema extends RequestBodySchema>(
						schema: TSchema,
					): HttpBuilder<TMethod, TPath, WithRequest<TRequest, "body", TSchema>, TResponses, TMetadata, TOpenApi, TUsed | "body", TLocalStatuses>;
				}) &
		("query" extends TUsed
			? EmptyObject
			: {
					query<const TSchema extends QuerySchema>(
						schema: TSchema,
					): HttpBuilder<TMethod, TPath, WithRequest<TRequest, "query", TSchema>, TResponses, TMetadata, TOpenApi, TUsed | "query", TLocalStatuses>;
				}) &
		("pathParams" extends TUsed
			? EmptyObject
			: {
					pathParams<const TSchema extends StandardSchemaV1 | RequestSchemaRecord>(
						schema: TSchema,
					): HttpBuilder<TMethod, TPath, WithRequest<TRequest, "pathParams", TSchema>, TResponses, TMetadata, TOpenApi, TUsed | "pathParams", TLocalStatuses>;
				}) &
		("headers" extends TUsed
			? EmptyObject
			: {
					headers<const THeaders extends RequestSchemaRecord>(
						headers: THeaders,
					): HttpBuilder<TMethod, TPath, WithRequest<TRequest, "headers", Merge<TRequest extends { headers: infer TCommon } ? TCommon : EmptyObject, THeaders>>, TResponses, TMetadata, TOpenApi, TUsed | "headers", TLocalStatuses>;
				}) &
		("requestKeys" extends TUsed
			? EmptyObject
			: {
					requestKeys<const TKeys extends RequestKeys>(
						keys: TKeys,
					): HttpBuilder<TMethod, TPath, WithRequest<TRequest, "keys", TKeys>, TResponses, TMetadata, TOpenApi, TUsed | "requestKeys", TLocalStatuses>;
				}) &
		("flattenRequestKeys" extends TUsed
			? EmptyObject
			: {
					flattenRequestKeys<const TFlatten extends boolean>(
						value: TFlatten,
					): HttpBuilder<TMethod, TPath, WithRequest<TRequest, "flattenKeys", TFlatten>, TResponses, TMetadata, TOpenApi, TUsed | "flattenRequestKeys", TLocalStatuses>;
				}) &
		("metadata" extends TUsed
			? { metadata: TMetadata }
			: {
					metadata: TMetadata &
						RouteMetadata &
						(<const TLocal extends RouteMetadata>(
							metadata: TLocal,
						) => HttpBuilder<TMethod, TPath, TRequest, TResponses, Merge<TMetadata, TLocal>, TOpenApi, TUsed | "metadata", TLocalStatuses>);
				}) &
		("openApi" extends TUsed
			? { openApi: TOpenApi }
			: {
					openApi: TOpenApi &
						OpenApiRouteOptions &
						(<const TLocal extends OpenApiRouteOptions>(
							openApi: TLocal,
						) => HttpBuilder<TMethod, TPath, TRequest, TResponses, TMetadata, Merge<TOpenApi, TLocal>, TUsed | "openApi", TLocalStatuses>);
				})
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
	get<const TPath extends string>(path: TPath): HttpBuilderFor<TOptions, "GET", TPath>;
	post<const TPath extends string>(path: TPath): HttpBuilderFor<TOptions, "POST", TPath>;
	put<const TPath extends string>(path: TPath): HttpBuilderFor<TOptions, "PUT", TPath>;
	patch<const TPath extends string>(path: TPath): HttpBuilderFor<TOptions, "PATCH", TPath>;
	delete<const TPath extends string>(path: TPath): HttpBuilderFor<TOptions, "DELETE", TPath>;
};

const createFactory = (options: RouteFactoryOptions = {}) => {
	assertStaticPathPrefix(options.pathPrefix);
	return {
		get: (path: string) => createHttpRoute("GET", path, options),
		post: (path: string) => createHttpRoute("POST", path, options),
		put: (path: string) => createHttpRoute("PUT", path, options),
		patch: (path: string) => createHttpRoute("PATCH", path, options),
		delete: (path: string) => createHttpRoute("DELETE", path, options),
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
