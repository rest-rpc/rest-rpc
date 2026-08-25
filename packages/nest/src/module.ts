import type { DynamicModule, ExecutionContext } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { ServerErrorHandlers } from "@rest-rpc/server";
import { RestRpcRouteInterceptor } from "./routeInterceptor.ts";

export const REST_RPC_MODULE_OPTIONS = Symbol.for("rest-rpc:nest-options");

/**
 * The context object passed to Nest adapter route handlers.
 */
export type NestRouteContext<TRequest = unknown, TResponse = unknown> = {
	req: TRequest;
	res: TResponse;
	signal: AbortSignal;
};

/**
 * Input provided to the `createContext` function when creating a Nest route context.
 */
export type CreateContextInput<
	TRequest = unknown,
	TResponse = unknown,
> = NestRouteContext<TRequest, TResponse> & {
	executionContext: ExecutionContext;
};

/**
 * Options for configuring the rest-rpc Nest adapter.
 */
export type RestRpcModuleOptions<
	TContext extends Record<string, unknown>,
	TRequest = unknown,
	TResponse = unknown,
> = {
	createContext?: (
		input: CreateContextInput<TRequest, TResponse>,
	) => TContext | Promise<TContext>;
	errorHandlers?: ServerErrorHandlers<TContext>;
};

/**
 * Configures rest-rpc route handling for Nest controllers.
 */
@Module({})
export class RestRpcModule {
	/**
	 * Registers the global interceptor used by rest-rpc Nest route decorators.
	 */
	static forRoot<
		TContext extends Record<string, unknown> = NestRouteContext,
		TRequest = unknown,
		TResponse = unknown,
	>(
		options: RestRpcModuleOptions<TContext, TRequest, TResponse> = {},
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
