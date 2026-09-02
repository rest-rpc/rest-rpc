import type {
	CommonOpenApiRouteOptions,
	RouteMetadata,
} from "./baseRouteDeclaration.ts";
import { getPathParamNames } from "./path.ts";
import type { RequestHeadersSchema } from "./request.ts";
import type { RouteResponses } from "./response.ts";
import {
	createHttpRoute,
	type FinalizedHttpRoute,
	type HttpBuilderFor,
} from "./httpRouteBuilder.ts";
import {
	createSseRoute,
	type FinalizedSseRoute,
	type SseBuilderFor,
} from "./sseRouteBuilder.ts";
import {
	createWebSocketRoute,
	type FinalizedWebSocketRoute,
	type WebSocketBuilderFor,
} from "./websocketRouteBuilder.ts";
export { joinPathPrefix } from "./baseRouteBuilder.ts";

/** Defaults applied locally by a configured route factory. */
export type RouteFactoryOptions = {
	flattenRequestKeys?: boolean;
	strictStatusCodes?: boolean;
	pathPrefix?: string;
	metadata?: RouteMetadata;
	responses?: RouteResponses;
	headers?: RequestHeadersSchema;
	openApi?: CommonOpenApiRouteOptions;
};

const assertStaticPathPrefix = (pathPrefix: string | undefined) => {
	if (pathPrefix && getPathParamNames(pathPrefix).length > 0) {
		throw new Error("Route factory pathPrefix cannot include path params.");
	}
};

type RouteFactory<TOptions = undefined> = {
	get(path: string): HttpBuilderFor<TOptions, "GET">;
	post(path: string): HttpBuilderFor<TOptions, "POST">;
	put(path: string): HttpBuilderFor<TOptions, "PUT">;
	patch(path: string): HttpBuilderFor<TOptions, "PATCH">;
	delete(path: string): HttpBuilderFor<TOptions, "DELETE">;
	sse(path: string): SseBuilderFor<TOptions>;
	ws(path: string): WebSocketBuilderFor<TOptions>;
};

const createFactory = (options: RouteFactoryOptions = {}) => {
	assertStaticPathPrefix(options.pathPrefix);
	return {
		get: (path: string) => createHttpRoute("GET", path, options),
		post: (path: string) => createHttpRoute("POST", path, options),
		put: (path: string) => createHttpRoute("PUT", path, options),
		patch: (path: string) => createHttpRoute("PATCH", path, options),
		delete: (path: string) => createHttpRoute("DELETE", path, options),
		sse: (path: string) => createSseRoute(path, options),
		ws: (path: string) => createWebSocketRoute(path, options),
	};
};

type Simplify<T> = T extends object ? { [K in keyof T]: T[K] } : T;

/** Route-first contract declaration factory. */
export const route = {
	...createFactory(),
	with<const TOptions extends RouteFactoryOptions>(options: TOptions) {
		return createFactory(options);
	},
} as unknown as Simplify<
	RouteFactory & {
		with<const TOptions extends RouteFactoryOptions>(
			options: TOptions,
		): RouteFactory<TOptions>;
	}
>;

export type {
	FinalizedHttpRoute,
	FinalizedSseRoute,
	FinalizedWebSocketRoute,
	HttpBuilderFor,
	RouteFactory,
	SseBuilderFor,
	WebSocketBuilderFor,
};
