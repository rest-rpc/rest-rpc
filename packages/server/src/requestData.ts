import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	isCustomBody,
	isFormBody,
	isJsonQuery,
	isMultipartBody,
} from "@rest-rpc/core/contract";

const flattenObjectSegment = (value: unknown) =>
	value as Record<string, unknown> | undefined;

const flattenQuerySegment = (
	route: RouteDeclaration,
	request: Record<string, unknown>,
) =>
	isJsonQuery(route.request?.query)
		? { query: request.query }
		: flattenObjectSegment(request.query);

const flattenPathAndHeaders = (request: Record<string, unknown>) => ({
	...flattenObjectSegment(request.params),
	...flattenObjectSegment(request.headers),
});

export const flattenRequestData = (
	route: RouteDeclaration,
	request: Record<string, unknown>,
) => {
	if (route.request?.flattenKeys === false) return request;

	return {
		...(route.mode !== "webSocket"
			? isCustomBody(route.request?.body) ||
				isFormBody(route.request?.body) ||
				isMultipartBody(route.request?.body)
				? { body: request.body }
				: flattenObjectSegment(request.body)
			: {}),
		...flattenQuerySegment(route, request),
		...flattenPathAndHeaders(request),
	};
};
