import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { BodyOptions } from "./body.ts";
import type {
	CommonOpenApiRouteOptions,
	HttpMethod,
	OpenApiResponseOptions,
	OpenApiRouteOptions,
	RouteDeclaration,
	RouteMetadata,
} from "./routeDeclaration.ts";
import { getPathParamNames } from "./path.ts";
import type {
	RequestHeadersSchema,
	RequestParamsSchema,
	QueryOptions,
} from "./request.ts";
import type {
	ResponseDeclaration,
	ResponseOptions,
	RouteResponses,
} from "./response.ts";
import type {
	RootRouteBuilder,
	RouteBuilderOptions,
} from "./routeBuilder.types.ts";

export type { RouteBuilderOptions } from "./routeBuilder.types.ts";

type RouteBuilderState = Partial<RouteDeclaration> &
	Omit<RouteBuilderOptions, "responses">;

const assertHttpStatusCode = (status: number) => {
	if (!Number.isInteger(status) || status < 100 || status > 599) {
		throw new Error(`Invalid HTTP response status "${status}".`);
	}
};

const assertStaticPathPrefix = (pathPrefix: string | undefined) => {
	if (pathPrefix && getPathParamNames(pathPrefix).length > 0) {
		throw new Error("Route builder pathPrefix cannot include path params.");
	}
};

const normalizeCommonResponses = (
	responses: NonNullable<RouteBuilderOptions["responses"]>,
): RouteResponses =>
	Object.fromEntries(
		Object.entries(responses).map(([status, body]) => [status, { body }]),
	);

const mergeUnique = (common: string[] = [], local: string[] = []) => [
	...new Set([...common, ...local]),
];

const mergeOpenApiResponse = (
	common: OpenApiResponseOptions | undefined,
	local: OpenApiResponseOptions | undefined,
): OpenApiResponseOptions => ({
	...common,
	...local,
	headers: { ...common?.headers, ...local?.headers },
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
		...common,
		...local,
		tags: mergeUnique(common?.tags, local?.tags),
		extensions: { ...common?.extensions, ...local?.extensions },
		responses: Object.fromEntries(
			[...statuses].map((status) => [
				status,
				mergeOpenApiResponse(
					common?.responses?.[Number(status)],
					local?.responses?.[Number(status)],
				),
			]),
		),
	};
};

const procedureState = (state: RouteBuilderState): RouteBuilderState => ({
	kind: "procedure",
	method: "POST",
	path: "",
	responses: {},
	...state,
});

const httpState = (
	state: RouteBuilderState,
	method: HttpMethod,
	path: string,
): RouteBuilderState => {
	assertStaticPathPrefix(state.pathPrefix);
	for (const status of Object.keys(state.responses ?? {})) {
		assertHttpStatusCode(Number(status));
	}

	const { headers, pathPrefix, ...declaration } = state;
	return {
		...declaration,
		kind: "http",
		method,
		path: pathPrefix ? `${pathPrefix}${path}` : path,
		responses: { ...state.responses },
		...(headers
			? { request: { headers: { inherited: headers } } }
			: { request: undefined }),
		...(state.openApi
			? { openApi: mergeOpenApi(state.openApi, undefined) }
			: {}),
	};
};

const addResponse = (
	state: RouteBuilderState,
	status: number,
	schema: ResponseDeclaration,
): RouteBuilder => {
	assertHttpStatusCode(status);
	return new RouteBuilder({
		...state,
		responses: { ...state.responses, [status]: schema },
	});
};

/** Immutable runtime implementation used by every route-builder stage. */
export class RouteBuilder {
	readonly "~restrpc": RouteBuilderState;

	constructor(state: RouteBuilderState = {}) {
		this["~restrpc"] = { ...state };
	}

	with(options: RouteBuilderOptions): RouteBuilder {
		assertStaticPathPrefix(options.pathPrefix);
		const { responses, ...sharedOptions } = options;
		return new RouteBuilder({
			...this["~restrpc"],
			...sharedOptions,
			...(responses ? { responses: normalizeCommonResponses(responses) } : {}),
		});
	}

	get(path: string): RouteBuilder {
		return new RouteBuilder(httpState(this["~restrpc"], "GET", path));
	}

	post(path: string): RouteBuilder {
		return new RouteBuilder(httpState(this["~restrpc"], "POST", path));
	}

	put(path: string): RouteBuilder {
		return new RouteBuilder(httpState(this["~restrpc"], "PUT", path));
	}

	patch(path: string): RouteBuilder {
		return new RouteBuilder(httpState(this["~restrpc"], "PATCH", path));
	}

	delete(path: string): RouteBuilder {
		return new RouteBuilder(httpState(this["~restrpc"], "DELETE", path));
	}

	body(schema: StandardSchemaV1, options?: BodyOptions): RouteBuilder {
		const state = this["~restrpc"];
		return new RouteBuilder({
			...state,
			request: {
				...state.request,
				body: schema,
				...options,
			},
		});
	}

	input(schema: StandardSchemaV1, options?: BodyOptions): RouteBuilder {
		const state = procedureState(this["~restrpc"]);
		return new RouteBuilder({
			...state,
			request: {
				...state.request,
				body: schema,
				...options,
			},
		});
	}

	headers(schema: RequestHeadersSchema): RouteBuilder {
		const state = this["~restrpc"];
		return new RouteBuilder({
			...state,
			request: {
				...state.request,
				headers: { ...state.request?.headers, local: schema },
			},
		});
	}

	query(schema: StandardSchemaV1, options?: QueryOptions): RouteBuilder {
		const state = this["~restrpc"];
		return new RouteBuilder({
			...state,
			request: {
				...state.request,
				query: schema,
				...(options ? { querySerialization: options.serialization } : {}),
			},
		});
	}

	params(schema: RequestParamsSchema): RouteBuilder {
		const state = this["~restrpc"];
		return new RouteBuilder({
			...state,
			request: { ...state.request, params: schema },
		});
	}

	metadata(metadata: RouteMetadata): RouteBuilder {
		const state = this["~restrpc"];
		return new RouteBuilder({
			...state,
			metadata: { ...state.metadata, ...metadata },
		});
	}

	openAPI(openApi: OpenApiRouteOptions): RouteBuilder {
		const state = this["~restrpc"];
		return new RouteBuilder({
			...state,
			openApi: mergeOpenApi(state.openApi, openApi),
		});
	}

	response(
		status: number,
		schema?: StandardSchemaV1,
		options?: ResponseOptions,
	): RouteBuilder {
		return addResponse(this["~restrpc"], status, { ...options, body: schema });
	}

	output(schema: StandardSchemaV1): RouteBuilder {
		return addResponse(procedureState(this["~restrpc"]), 200, { body: schema });
	}

	streamResponse(status: number, schema: StandardSchemaV1): RouteBuilder {
		return addResponse(this["~restrpc"], status, {
			body: { kind: "stream", schema },
		});
	}
}

const runtimeRoute = new RouteBuilder();

/**
 * Entry point for declaring contract-first HTTP and procedure routes.
 *
 * @remarks Every builder method returns a new route value, so configured route
 * factories can be reused safely across declarations.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/declaration#route-builders}
 * @see {@link https://rest-rpc.dev/docs/procedures#contract-first-procedures}
 */
export const route = runtimeRoute as unknown as RootRouteBuilder;
