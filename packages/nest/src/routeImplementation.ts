import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type Contract,
	type ImplementationTreeFor,
	type RouteImplementation,
	type RouteHandlers as ServerRouteHandlers,
	type RouteRequest as ServerRouteRequest,
	route as serverRoute,
	type RouteHandler as serverRouteHandler,
	router as serverRouter,
} from "@rest-rpc/server";
import type { NestRouteContext } from "./module.ts";

/**
 * A contract tree containing only HTTP routes for the Nest adapter.
 */
export type NestContract = Contract<HttpRouteDeclaration>;

/**
 * The context object passed to Nest adapter route handlers.
 */
export type NestHandlerContext<
	TContext extends Record<string, unknown>,
	TRequest = unknown,
	TResponse = unknown,
> = TContext & NestRouteContext<TRequest, TResponse>;

/**
 * Infers the Nest route handler request type for a given route declaration.
 */
export type RouteRequest<
	E extends HttpRouteDeclaration,
	TContext extends Record<string, unknown> = Record<never, never>,
	TRequest = unknown,
	TResponse = unknown,
> = ServerRouteRequest<E, NestHandlerContext<TContext, TRequest, TResponse>>;

/**
 * Handler tree accepted by `router()` when building a Nest implementation tree.
 */
export type RouteHandlers<
	TContract extends NestContract,
	TContext extends Record<string, unknown> = never,
	TRequest = unknown,
	TResponse = unknown,
> = ServerRouteHandlers<
	TContract,
	NestHandlerContext<TContext, TRequest, TResponse>,
	Record<never, never>
>;

/**
 * Infers the Nest route handler type for a given route declaration.
 */
export type RouteHandler<
	E extends HttpRouteDeclaration,
	TContext extends Record<string, unknown> = Record<never, never>,
	TRequest = unknown,
	TResponse = unknown,
> = serverRouteHandler<E, NestHandlerContext<TContext, TRequest, TResponse>>;

/**
 * Builds a Nest route implementation for a single contract route.
 */
export function route<
	const TRoute extends HttpRouteDeclaration,
	TContext extends Record<string, unknown> = Record<never, never>,
	TRequest = unknown,
	TResponse = unknown,
>(
	contract: TRoute,
	handler: RouteHandler<TRoute, TContext, TRequest, TResponse>,
): RouteImplementation<TRoute> {
	return serverRoute(contract, handler as never);
}

/**
 * Builds a Nest router implementation for a contract.
 */
export function router<
	const TContract extends NestContract,
	TContext extends Record<string, unknown> = Record<never, never>,
	TRequest = unknown,
	TResponse = unknown,
>(
	contract: TContract,
	handlers: RouteHandlers<TContract, TContext, TRequest, TResponse>,
): ImplementationTreeFor<TContract, HttpRouteDeclaration> {
	return serverRouter(contract, handlers as never) as ImplementationTreeFor<
		TContract,
		HttpRouteDeclaration
	>;
}

/**
 * Creates typed Nest adapter helpers with shared context types.
 */
export function initNest<
	TContext extends Record<string, unknown> = Record<never, never>,
	TRequest = unknown,
	TResponse = unknown,
>() {
	return {
		route: <const TRoute extends HttpRouteDeclaration>(
			contract: TRoute,
			handler: RouteHandler<TRoute, TContext, TRequest, TResponse>,
		) => route<TRoute, TContext, TRequest, TResponse>(contract, handler),
		router: <const TContract extends NestContract>(
			contract: TContract,
			handlers: RouteHandlers<TContract, TContext, TRequest, TResponse>,
		) => router<TContract, TContext, TRequest, TResponse>(contract, handlers),
	};
}
