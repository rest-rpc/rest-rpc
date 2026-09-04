import type {
	BaseRouteDeclaration,
	BuilderExtension,
	HttpBuilder,
	HttpBuilderDeclaration,
	HttpBuilderFor,
	HttpBuilderState,
	HttpMethod,
	RouteFactoryOptions,
	ServerRequest,
	SseBuilder,
	SseBuilderDeclaration,
	SseBuilderFor,
	SseBuilderState,
} from "@rest-rpc/core/contract";
import type {
	HttpRouteHandlerContext,
	RouteHandler,
	RouteImplementation,
	RouteRequest,
	ServerHttpRouteDeclaration,
} from "./router.ts";

type EmptyObject = Record<never, never>;
type AnyRouteHandler = (...args: never[]) => unknown;

type Merge<T> = {
	[K in keyof T]: T[K];
};

type ServerFirstRequest<
	TRoute extends BaseRouteDeclaration,
	TContext extends HttpRouteHandlerContext,
> = Merge<
	(ServerRequest<TRoute> extends never
		? EmptyObject
		: ServerRequest<TRoute>) & {
		context: TContext;
		signal: AbortSignal;
	}
>;

type DeclaredRequest<
	TRoute extends ServerHttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext,
> = Merge<RouteRequest<TRoute, TContext> & { signal: AbortSignal }>;

type DeclaredHandlerResult<
	TRoute extends ServerHttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext,
> = ReturnType<RouteHandler<TRoute, TContext>>;

type WithHttpBuilderContext<
	TState extends HttpBuilderState,
	TContext extends HttpRouteHandlerContext,
> = HttpBuilder<
	Omit<TState, "extension"> & {
		extension: ServerHttpBuilderExtension<TContext>;
	}
>;

type HttpImplementationBuilder<
	TState extends HttpBuilderState,
	TContext extends HttpRouteHandlerContext,
> = {
	context<
		TNextContext extends HttpRouteHandlerContext,
	>(): WithHttpBuilderContext<TState, TNextContext>;
} & (HttpBuilderDeclaration<TState> extends infer TRoute extends
	BaseRouteDeclaration
	? TRoute extends ServerHttpRouteDeclaration
		? {
				handler<const TResult extends DeclaredHandlerResult<TRoute, TContext>>(
					handler: (request: DeclaredRequest<TRoute, TContext>) => TResult,
				): RouteImplementation<
					TRoute,
					(request: DeclaredRequest<TRoute, TContext>) => TResult
				>;
			}
		: {
				handler<const TResult>(
					handler: (request: ServerFirstRequest<TRoute, TContext>) => TResult,
				): RouteImplementation<
					TRoute,
					(request: ServerFirstRequest<TRoute, TContext>) => TResult
				>;
			}
	: never);

interface ServerHttpBuilderExtension<
	TContext extends HttpRouteHandlerContext,
> extends BuilderExtension {
	readonly result: this["state"] extends infer TState extends HttpBuilderState
		? HttpImplementationBuilder<TState, TContext>
		: never;
}

type WithSseBuilderContext<
	TState extends SseBuilderState,
	TContext extends HttpRouteHandlerContext,
> = SseBuilder<
	Omit<TState, "extension"> & {
		extension: ServerSseBuilderExtension<TContext>;
	}
>;

type SseRouteForState<TState extends SseBuilderState> =
	SseBuilderDeclaration<TState> &
		([TState["response"]] extends [never]
			? EmptyObject
			: { responses: { 200: TState["response"] } });

type SseImplementationBuilder<
	TState extends SseBuilderState,
	TContext extends HttpRouteHandlerContext,
> = {
	context<
		TNextContext extends HttpRouteHandlerContext,
	>(): WithSseBuilderContext<TState, TNextContext>;
} & (SseRouteForState<TState> extends infer TRoute extends BaseRouteDeclaration
	? TRoute extends ServerHttpRouteDeclaration
		? {
				handler<const TResult extends DeclaredHandlerResult<TRoute, TContext>>(
					handler: (request: DeclaredRequest<TRoute, TContext>) => TResult,
				): RouteImplementation<
					TRoute,
					(request: DeclaredRequest<TRoute, TContext>) => TResult
				>;
			}
		: EmptyObject
	: never);

interface ServerSseBuilderExtension<
	TContext extends HttpRouteHandlerContext,
> extends BuilderExtension {
	readonly result: this["state"] extends infer TState extends SseBuilderState
		? SseImplementationBuilder<TState, TContext>
		: never;
}

type ServerRouteOptions<TOptions extends RouteFactoryOptions> = Omit<
	{ flattenRequestKeys: false },
	keyof TOptions
> &
	TOptions;

/** Type-level model of the server-first HTTP and SSE route factory. */
export type ServerRouteFactory<
	TOptions extends RouteFactoryOptions = { flattenRequestKeys: false },
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
> = {
	[TMethod in Lowercase<HttpMethod>]: <const TPath extends string>(
		path: TPath,
	) => HttpBuilderFor<
		TOptions,
		Uppercase<TMethod> & HttpMethod,
		TPath,
		ServerHttpBuilderExtension<TContext>
	>;
} & {
	sse<const TPath extends string>(
		path: TPath,
	): SseBuilderFor<TOptions, TPath, ServerSseBuilderExtension<TContext>>;
	with<const TNextOptions extends RouteFactoryOptions>(
		options: TNextOptions,
	): ServerRouteFactory<ServerRouteOptions<TNextOptions>, TContext>;
};

type ImplementationBuilder<
	TRoute extends ServerHttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext,
> = {
	context<
		TNextContext extends HttpRouteHandlerContext,
	>(): ImplementationBuilder<TRoute, TNextContext>;
	handler<const TResult extends DeclaredHandlerResult<TRoute, TContext>>(
		handler: (request: DeclaredRequest<TRoute, TContext>) => TResult,
	): RouteImplementation<
		TRoute,
		(request: DeclaredRequest<TRoute, TContext>) => TResult
	>;
};

type ServerContract =
	| ServerHttpRouteDeclaration
	| { readonly [key: string]: ServerContract };

/** Maps a contract route or tree to handler attachment builders. */
export type ImplementationBuildersFor<
	TNode extends ServerContract,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
> = TNode extends ServerHttpRouteDeclaration
	? ImplementationBuilder<TNode, TContext>
	: {
			readonly [K in keyof TNode]: TNode[K] extends ServerContract
				? ImplementationBuildersFor<TNode[K], TContext>
				: never;
		};

/** Type-level model of contract-first handler attachment. */
export type Implement = <const TNode extends ServerContract>(
	contract: TNode,
) => ImplementationBuildersFor<TNode>;

/** An HTTP or SSE implementation retaining its concrete handler type. */
export type ServerRouteImplementation = RouteImplementation<
	BaseRouteDeclaration,
	AnyRouteHandler
>;

/** An ordinary object tree containing server-first route implementations. */
export type ServerImplementationTree =
	| ServerRouteImplementation
	| { readonly [key: string]: ServerImplementationTree };
