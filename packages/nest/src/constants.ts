import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";

export const REST_RPC_ROUTE_METADATA = Symbol.for("rest-rpc:nest-route");

export type RouteMetadata = {
	route: HttpRouteDeclaration;
};
