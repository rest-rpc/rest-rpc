import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import {
	isCustomBody,
	isFormBody,
	isMultipartBody,
	isNoBody,
	isStream,
} from "./body.ts";
import type { Contract, RouteDeclaration } from "./contract.ts";
import { getPathParamNames } from "./path.ts";
import type { RequestKeys } from "./request.ts";
import {
	isJsonQuery,
	isRequestSchemaRecord,
	REQUEST_CONTEXT_KEY,
} from "./request.ts";
import { resolveBuiltInRequestKeys } from "./requestKeys.ts";
import {
	getResponseBody,
	getResponseHeaders,
	getRouteResponses,
} from "./response.ts";
import { contractRoutes } from "./traversal.ts";

export type FlatRequestInput = Record<string, unknown>;

export type GroupedRequestInput = {
	body?: unknown;
	query?: unknown;
	pathParams?: Record<string, unknown>;
	headers?: Record<string, unknown>;
};

export type GroupRequestInputOptions = {
	strictRequestKeys?: boolean;
};

const takesRouteInput = (route: RouteDeclaration) =>
	Boolean(
		route.request?.body ||
			route.request?.query ||
			route.request?.pathParams ||
			route.request?.headers,
	);

const assertNoDuplicateKeys = (
	route: RouteDeclaration,
	keys: readonly string[],
) => {
	if (keys.length === new Set(keys).size) return;

	throw new Error(
		`Route declaration at path "${route.path}" has duplicate request keys across its "body", "query", "pathParams" and "headers" definitions.`,
	);
};

const assertNoReservedRequestKeys = (route: RouteDeclaration) => {
	if (route.request?.keys?.[REQUEST_CONTEXT_KEY] === undefined) return;

	throw new Error(
		`Route declaration at path "${route.path}" has a reserved request key "${REQUEST_CONTEXT_KEY}". Rename it to avoid conflict with the route handler context.`,
	);
};

const getHeaderRequestKeys = (route: RouteDeclaration) => [
	...new Set([
		...Object.keys(route.request?.headers ?? {}),
		...Object.entries(route.request?.keys ?? {})
			.filter(([, segment]) => segment === "headers")
			.map(([key]) => key),
	]),
];

const assertNoReservedHeaderKeys = (route: RouteDeclaration) => {
	for (const key of getHeaderRequestKeys(route)) {
		if (key.toLowerCase() !== "content-type") continue;

		throw new Error(
			`Route declaration at path "${route.path}" has a reserved header key "${key}". Use customBody({ schema, contentType }) to declare request content type instead.`,
		);
	}
};

const assertNoCaseInsensitiveHeaderDuplicates = (route: RouteDeclaration) => {
	const normalized = new Set<string>();
	for (const key of getHeaderRequestKeys(route)) {
		const normalizedKey = key.toLowerCase();
		if (normalized.has(normalizedKey)) {
			throw new Error(
				`Route declaration at path "${route.path}" has duplicate header keys that differ only by case.`,
			);
		}
		normalized.add(normalizedKey);
	}
};

const getResponseHeaderKeys = (route: RouteDeclaration) => [
	...new Set(
		Object.values(route.responses ?? {}).flatMap((response) =>
			Object.keys(getResponseHeaders(response) ?? {}),
		),
	),
];

const assertNoReservedResponseHeaderKeys = (route: RouteDeclaration) => {
	for (const key of getResponseHeaderKeys(route)) {
		if (key.toLowerCase() !== "content-type") continue;

		throw new Error(
			`Route declaration at path "${route.path}" has a reserved response header key "${key}". Use customBody({ schema, contentType }) to declare response content type instead.`,
		);
	}
};

const assertNoCaseInsensitiveResponseHeaderDuplicates = (
	route: RouteDeclaration,
) => {
	for (const response of Object.values(route.responses ?? {})) {
		const normalized = new Set<string>();
		for (const key of Object.keys(getResponseHeaders(response) ?? {})) {
			const normalizedKey = key.toLowerCase();
			if (normalized.has(normalizedKey)) {
				throw new Error(
					`Route declaration at path "${route.path}" has duplicate response header keys that differ only by case.`,
				);
			}
			normalized.add(normalizedKey);
		}
	}
};

const assertCustomResponsesDeclareContentType = (route: RouteDeclaration) => {
	for (const response of Object.values(route.responses ?? {})) {
		const body = getResponseBody(response);
		const customBody = isStream(body) ? body.schema : body;
		if (!isCustomBody(customBody) || customBody.contentType !== undefined) {
			continue;
		}

		throw new Error(
			`Route declaration at path "${route.path}" has a custom response body without a contentType.`,
		);
	}
};

const assertPathParamsResolved = (route: RouteDeclaration) => {
	if (!route.request?.keys && route.request?.flattenKeys === false) return;

	const pathParams = getPathParamNames(route.path);
	for (const key of pathParams) {
		if (route.request?.keys?.[key] !== "pathParams") {
			throw new Error(
				`Route declaration at path "${route.path}" has a path param "${key}" without a matching pathParams schema key.`,
			);
		}
	}

	const pathParamSet = new Set(pathParams);
	for (const [key, segment] of Object.entries(route.request?.keys ?? {})) {
		if (segment === "pathParams" && !pathParamSet.has(key)) {
			throw new Error(
				`Route declaration at path "${route.path}" has a pathParams request key "${key}" without a matching path param.`,
			);
		}
	}
};

const requestSchemas = (route: RouteDeclaration) =>
	[
		[
			"body",
			isCustomBody(route.request?.body) ||
			isFormBody(route.request?.body) ||
			isMultipartBody(route.request?.body) ||
			isNoBody(route.request?.body)
				? undefined
				: route.request?.body,
		],
		[
			"query",
			isJsonQuery(route.request?.query) ? undefined : route.request?.query,
		],
		["pathParams", route.request?.pathParams],
	] as const;

const applyHeaderRequestKeys = (route: RouteDeclaration) => {
	const headers = route.request?.headers;
	const requestKeys = route.request?.keys;
	if (!headers || !requestKeys) return;

	for (const key of Object.keys(headers)) {
		const existingSegment = requestKeys[key];
		if (existingSegment && existingSegment !== "headers") {
			assertNoDuplicateKeys(route, [key, key]);
		}
		requestKeys[key] = "headers";
	}
};

export const validateResolvedRequestKeys = (route: RouteDeclaration) => {
	if (route.responses) getRouteResponses(route);
	const routePath = route.path;
	if (route.mode === "sse" && route.request?.headers !== undefined) {
		throw new Error(
			`SSE route declaration at path "${routePath}" cannot declare request headers. EventSource does not support custom request headers.`,
		);
	}
	applyHeaderRequestKeys(route);
	const keys = Object.keys(route.request?.keys ?? {});
	assertNoDuplicateKeys(route, keys);
	assertNoReservedRequestKeys(route);
	assertNoReservedHeaderKeys(route);
	assertNoCaseInsensitiveHeaderDuplicates(route);
	assertNoReservedResponseHeaderKeys(route);
	assertNoCaseInsensitiveResponseHeaderDuplicates(route);
	assertCustomResponsesDeclareContentType(route);

	if (
		(isCustomBody(route.request?.body) ||
			isFormBody(route.request?.body) ||
			isMultipartBody(route.request?.body)) &&
		route.request?.keys?.body
	) {
		throw new Error(
			`Route declaration at path "${route.path}" has a "body" key in query or pathParams. Rename it to avoid conflict with the request body.`,
		);
	}

	if (isJsonQuery(route.request?.query) && route.request?.keys?.query) {
		throw new Error(
			`Route declaration at path "${route.path}" has a "query" key in body, pathParams or headers. Rename it to avoid conflict with the JSON query value.`,
		);
	}

	assertPathParamsResolved(route);
};

export const groupRequestInput = (
	route: RouteDeclaration,
	input: FlatRequestInput,
	options: GroupRequestInputOptions = {},
): GroupedRequestInput => {
	const strictRequestKeys = options.strictRequestKeys ?? true;
	const isSpecialRequestBody =
		isCustomBody(route.request?.body) ||
		isFormBody(route.request?.body) ||
		isMultipartBody(route.request?.body);
	const isJsonQueryRequest = isJsonQuery(route.request?.query);
	const requestKeys = route.request?.keys;

	if (!requestKeys && takesRouteInput(route)) {
		throw new Error(
			`Missing request key metadata for ${route.method} ${route.path}. Declare requestKeys before grouping flattened request input.`,
		);
	}

	return Object.entries(input).reduce((grouped, [key, value]) => {
		if (key === "body" && isSpecialRequestBody) {
			grouped.body = value;
			return grouped;
		}

		if (key === "query" && isJsonQueryRequest) {
			grouped.query = value;
			return grouped;
		}

		const segment = requestKeys?.[key];
		if (segment) {
			if (!grouped[segment]) grouped[segment] = {};
			(grouped[segment] as Record<string, unknown>)[key] = value;
			return grouped;
		}

		if (!strictRequestKeys) return grouped;

		throw new Error(
			`Unknown request key "${key}" for ${route.method} ${route.path}.`,
		);
	}, {} as GroupedRequestInput);
};

const resolveRequestKeysForSchema = (
	route: RouteDeclaration,
	segment: "body" | "query" | "pathParams",
	schema: StandardSchemaV1 | Record<string, StandardSchemaV1>,
) => {
	if (isRequestSchemaRecord(schema)) {
		return Object.fromEntries(Object.keys(schema).map((key) => [key, false]));
	}

	const keyInfo = resolveBuiltInRequestKeys(schema);
	if (!keyInfo) {
		throw new Error(
			`Could not resolve request keys for ${segment} schema on ${route.method} ${route.path}. Declare requestKeys or use a schema that supports automatic key resolution.`,
		);
	}
	return keyInfo;
};

export const validateContract = <TContract extends Contract>(
	contract: TContract,
): TContract => {
	for (const route of contractRoutes(contract)) {
		if (
			!takesRouteInput(route) ||
			route.request?.keys ||
			route.request?.flattenKeys === false
		) {
			validateResolvedRequestKeys(route);
			continue;
		}

		const requestKeys: RequestKeys = {};
		for (const [segment, schema] of requestSchemas(route)) {
			if (!schema) continue;
			const keys = Object.keys(
				resolveRequestKeysForSchema(route, segment, schema),
			);
			assertNoDuplicateKeys(route, [...Object.keys(requestKeys), ...keys]);
			for (const key of keys) requestKeys[key] = segment;
		}
		for (const key of Object.keys(route.request?.headers ?? {})) {
			assertNoDuplicateKeys(route, [...Object.keys(requestKeys), key]);
			requestKeys[key] = "headers";
		}
		(route.request ??= {}).keys = requestKeys;
		validateResolvedRequestKeys(route);
	}

	return contract;
};
