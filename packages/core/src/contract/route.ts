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
} from "./contract.ts";
import { noBody } from "./body.ts";
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
		if (options.responses) {
			Object.assign(this, { responses: cloneResponses(options.responses) });
		}
		if (options.metadata) {
			Object.assign(this, { metadata: cloneMetadata(options.metadata) });
		}
		if (options.openApi) {
			Object.assign(this, { openApi: mergeOpenApi(options.openApi, undefined) });
		}
		Object.defineProperties(this, {
			_state: {
				value: { writes: new Set(), responseStatuses: new Set() },
				writable: true,
			},
			_commonResponses: { value: cloneResponses(options.responses) },
			_commonMetadata: { value: cloneMetadata(options.metadata) },
			_commonOpenApi: { value: cloneMetadata(options.openApi) },
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
	with(options: RouteFactoryOptions) {
		return createFactory(options);
	},
};
