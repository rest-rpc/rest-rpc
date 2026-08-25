import type { DynamicModule, ExecutionContext } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { ServerErrorHandlers } from "@rest-rpc/server";
import { RestRpcRouteInterceptor } from "./routeInterceptor.ts";

export const REST_RPC_MODULE_OPTIONS = Symbol.for("rest-rpc:nest-options");

/**
 * Default application context passed to Nest route handlers.
 *
 * @remarks Augment this interface to set the route handler context across a
 * project.
 */
export interface DefaultNestContext extends Record<string, unknown> {}

/**
 * Context supplied by the Nest adapter to every route handler.
 */
export type NestRouteContext = {
	signal: AbortSignal;
};

/**
 * The context object passed to Nest adapter route handlers.
 */
export type NestHandlerContext<
	TContext extends Record<string, unknown> = DefaultNestContext,
> = TContext & NestRouteContext;

/**
 * Options for configuring the rest-rpc Nest adapter.
 */
export type RestRpcModuleOptions<
	TContext extends Record<string, unknown> = DefaultNestContext,
> = {
	createContext?: (context: ExecutionContext) => TContext | Promise<TContext>;
	errorHandlers?: ServerErrorHandlers<NestHandlerContext<TContext>>;
};

/**
 * Configures rest-rpc route handling for Nest controllers.
 */
@Module({})
export class RestRpcModule {
	/**
	 * Registers the global interceptor used by rest-rpc Nest route decorators.
	 */
	static forRoot<TContext extends Record<string, unknown> = DefaultNestContext>(
		options: RestRpcModuleOptions<TContext> = {},
	): DynamicModule {
		return {
			module: RestRpcModule,
			providers: [
				{
					provide: REST_RPC_MODULE_OPTIONS,
					useValue: options,
				},
				{
					provide: RestRpcRouteInterceptor,
					inject: [REST_RPC_MODULE_OPTIONS],
					useFactory: (
						moduleOptions: RestRpcModuleOptions<Record<string, unknown>>,
					) => new RestRpcRouteInterceptor(moduleOptions),
				},
				{
					provide: APP_INTERCEPTOR,
					useExisting: RestRpcRouteInterceptor,
				},
			],
			exports: [RestRpcRouteInterceptor],
		};
	}
}
