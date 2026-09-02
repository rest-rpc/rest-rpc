import type { HttpRouteDeclaration } from "./httpRouteBuilder.ts";
import type { SseRouteDeclaration } from "./sseRouteBuilder.ts";
import type { WebSocketRouteDeclaration } from "./websocketRouteBuilder.ts";

/** Any complete canonical route declaration in a contract tree. */
export type RouteDeclaration =
	| HttpRouteDeclaration
	| SseRouteDeclaration
	| WebSocketRouteDeclaration;

/** A route declaration or nested object tree of route declarations. */
export type Contract = RouteDeclaration | { [key: string]: Contract };
