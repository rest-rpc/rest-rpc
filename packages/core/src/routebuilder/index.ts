import type {
	HttpMethod,
	RouteDeclaration,
	RouteFactoryOptions,
} from "../contract/contract.ts";
import { getPathParamNames } from "../contract/path.ts";
import { createHttpRoute, type HttpBuilderFor } from "./http.ts";
import { createSseRoute, type SseBuilderFor } from "./sse.ts";
import { createWebSocketRoute, type WebSocketBuilderFor } from "./webSocket.ts";
export { joinPathPrefix } from "./shared.ts";

const assertStaticPathPrefix = (pathPrefix: string | undefined) => {
	if (pathPrefix && getPathParamNames(pathPrefix).length > 0) {
		throw new Error("Route factory pathPrefix cannot include path params.");
	}
};

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
	sse<const TPath extends string>(path: TPath): SseBuilderFor<TOptions, TPath>;
	ws<const TPath extends string>(
		path: TPath,
	): WebSocketBuilderFor<TOptions, TPath>;
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

export type {
	HttpBuilderFor,
	RouteFactory,
	RouteFactoryOptions,
	SseBuilderFor,
	WebSocketBuilderFor,
};
