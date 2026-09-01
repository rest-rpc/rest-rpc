import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	JsonQuery,
	RequestParamsSchema,
	RequestQuerySchema,
	RequestBodySchema,
	RequestKeys,
	RequestHeadersDeclaration,
	RequestHeadersSchema,
} from "./request.ts";
import type { RouteResponses } from "./response.ts";
import type { WebSocketMessageSchemas } from "./websocketMessages.ts";

/** An HTTP method supported by a rest-rpc route. */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/** Application-defined metadata attached to a route. */
export type RouteMetadata = Record<string, unknown>;

/** Declares one OpenAPI response header entry. */
export type OpenApiResponseHeader =
	| StandardSchemaV1
	| { description?: string; schema: StandardSchemaV1 };

/** Adds OpenAPI-only metadata for one route response status. */
export type OpenApiResponseOptions = {
	description?: string;
	headers?: Record<string, OpenApiResponseHeader>;
};

/** OpenAPI metadata attached to one route. */
export type OpenApiRouteOptions = {
	summary?: string;
	description?: string;
	operationId?: string;
	tags?: string[];
	deprecated?: boolean;
	security?: Array<Record<string, string[]>>;
	externalDocs?: { url: string; description?: string };
	responses?: Record<number, OpenApiResponseOptions>;
	extensions?: Record<`x-${string}`, unknown>;
};

/** OpenAPI metadata that may be shared by a configured route factory. */
export type CommonOpenApiRouteOptions = Omit<
	OpenApiRouteOptions,
	"summary" | "description" | "operationId"
>;

/** Selects whether a route is handled as HTTP, SSE, or WebSocket. */
export type RouteMode = "http" | "sse" | "webSocket";

/** Canonical request declaration nested on a route. */
export type RouteRequestDeclaration = {
	body?: RequestBodySchema;
	query?: RequestQuerySchema | JsonQuery;
	params?: RequestParamsSchema;
	headers?: RequestHeadersDeclaration;
	keys?: RequestKeys;
	flattenKeys?: boolean;
};

/** Fields shared by every canonical route declaration. */
export type BaseRouteDeclaration = {
	path: string;
	method: HttpMethod;
	mode?: RouteMode;
	request?: RouteRequestDeclaration;
	metadata?: RouteMetadata;
	openApi?: OpenApiRouteOptions;
};

/** A canonical ordinary HTTP route declaration. */
export type HttpRouteDeclaration = BaseRouteDeclaration & {
	mode?: "http";
	responses: RouteResponses;
	messages?: never;
};

/** A canonical server-sent event route declaration. */
export type SseRouteDeclaration = Omit<
	BaseRouteDeclaration,
	"method" | "mode"
> & {
	method: "GET";
	mode: "sse";
	request?: Omit<RouteRequestDeclaration, "body" | "headers"> & {
		body?: never;
		headers?: never;
	};
	responses: { 200: StandardSchemaV1 };
	messages?: never;
};

type WebSocketRouteMessages =
	| { client: WebSocketMessageSchemas; server?: never }
	| { client?: never; server: WebSocketMessageSchemas }
	| {
			client: WebSocketMessageSchemas;
			server: WebSocketMessageSchemas;
	  };

/** A canonical WebSocket route declaration. */
export type WebSocketRouteDeclaration = Omit<
	BaseRouteDeclaration,
	"method" | "mode"
> & {
	method: "GET";
	mode: "webSocket";
	request?: Omit<RouteRequestDeclaration, "body" | "headers"> & {
		body?: never;
		headers?: never;
	};
	messages: WebSocketRouteMessages;
	responses?: never;
};

/** Any complete canonical route declaration in a contract tree. */
export type RouteDeclaration =
	| HttpRouteDeclaration
	| SseRouteDeclaration
	| WebSocketRouteDeclaration;

/** A route declaration or nested object tree of route declarations. */
export type Contract = RouteDeclaration | { [key: string]: Contract };

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

/** Returns whether a value has the canonical shape of a route declaration. */
export function isRouteDeclaration(value: unknown): value is RouteDeclaration {
	return (
		typeof value === "object" &&
		value !== null &&
		"path" in value &&
		"method" in value
	);
}
