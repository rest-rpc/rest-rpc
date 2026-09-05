import type {
	BaseRouteDeclaration,
	BuilderExtension,
	HttpBuilderAtPath,
	HttpBuilderDeclaration,
	HttpBuilderFor,
	HttpBuilderState,
	HttpMethod,
	RouteFactoryOptions,
	ServerRequest,
	SseBuilderAtPath,
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
type MaybePromise<T> = T | Promise<T>;

/** Explicit HTTP response envelope accepted from an inferred route handler. */
export type ImplicitResponseEnvelope =
	| { status: number; body?: never; contentType?: string }
	| { status: number; body: unknown; contentType?: string };

/** Wire response classifications available to server-first HTTP routes. */
export type ServerFirstResponseKind =
	| "empty"
	| "json"
	| "ndjson"
	| "custom"
	| "custom-stream"
	| "sse";

type BodyResponseKind<TResponse, TBody> =
	TBody extends AsyncIterable<unknown>
		? TResponse extends { contentType: string }
			? "custom-stream"
			: "ndjson"
		: TResponse extends { contentType: string }
			? "custom"
			: "json";

/** Classifies one inferred response envelope by its statically known shape. */
export type ImplicitResponseKind<TResponse> = TResponse extends unknown
	? "body" extends keyof TResponse
		? TResponse extends { body: infer TBody }
			? BodyResponseKind<TResponse, TBody>
			: "empty"
		: "empty"
	: never;

type ImplementationParts<TImplementation> =
	TImplementation extends RouteImplementation<infer TRoute, infer THandler>
		? { route: TRoute; handler: THandler }
		: never;

type HandlerResult<THandler> = THandler extends AnyRouteHandler
	? Awaited<ReturnType<THandler>>
	: never;

/** Infers the source response union retained by an implicit route implementation. */
export type InferredRouteResponse<TImplementation> =
	ImplementationParts<TImplementation> extends {
		route: infer TRoute;
		handler: infer THandler;
	}
		? TRoute extends { responses: Record<number, unknown> }
			? never
			: HandlerResult<THandler>
		: never;

/** Infers the wire response kinds represented by a server-first implementation. */
export type ServerFirstRouteResponseKind<TImplementation> =
	ImplementationParts<TImplementation> extends {
		route: infer TRoute;
		handler: infer THandler;
	}
		? TRoute extends { mode: "sse" }
			? "sse"
			: TRoute extends { responses: Record<number, unknown> }
				? never
				: ImplicitResponseKind<HandlerResult<THandler>>
		: never;

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
	TPath extends string,
	TContext extends HttpRouteHandlerContext,
> = HttpBuilderAtPath<
	Omit<TState, "extension"> & {
		extension: ServerHttpBuilderExtension<TContext>;
	},
	TPath
>;

type HttpRouteForState<
	TState extends HttpBuilderState,
	TPath extends string,
> = HttpBuilderDeclaration<TState> & { readonly path: TPath };

type HttpImplementationBuilder<
	TState extends HttpBuilderState,
	TPath extends string,
	TContext extends HttpRouteHandlerContext,
> = {
	context<
		TNextContext extends HttpRouteHandlerContext,
	>(): WithHttpBuilderContext<TState, TPath, TNextContext>;
} & (HttpBuilderDeclaration<TState> extends infer TRoute extends
	BaseRouteDeclaration
	? TRoute extends ServerHttpRouteDeclaration
		? {
				handler<const TResult extends DeclaredHandlerResult<TRoute, TContext>>(
					handler: (request: DeclaredRequest<TRoute, TContext>) => TResult,
				): RouteImplementation<
					HttpRouteForState<TState, TPath>,
					(request: DeclaredRequest<TRoute, TContext>) => TResult
				>;
			}
		: {
				handler<const TResult extends MaybePromise<ImplicitResponseEnvelope>>(
					handler: (request: ServerFirstRequest<TRoute, TContext>) => TResult,
				): RouteImplementation<
					HttpRouteForState<TState, TPath>,
					(request: ServerFirstRequest<TRoute, TContext>) => TResult
				>;
			}
	: never);

interface ServerHttpBuilderExtension<
	TContext extends HttpRouteHandlerContext,
> extends BuilderExtension {
	readonly result: this["state"] extends infer TState extends HttpBuilderState
		? this["path"] extends infer TPath extends string
			? HttpImplementationBuilder<TState, TPath, TContext>
			: never
		: never;
}

type WithSseBuilderContext<
	TState extends SseBuilderState,
	TPath extends string,
	TContext extends HttpRouteHandlerContext,
> = SseBuilderAtPath<
	Omit<TState, "extension"> & {
		extension: ServerSseBuilderExtension<TContext>;
	},
	TPath
>;

type SseRouteForState<
	TState extends SseBuilderState,
	TPath extends string,
> = SseBuilderDeclaration<TState> & { readonly path: TPath } & ([
		TState["response"],
	] extends [never]
		? EmptyObject
		: { responses: { 200: TState["response"] } });

type SseImplementationBuilder<
	TState extends SseBuilderState,
	TPath extends string,
	TContext extends HttpRouteHandlerContext,
> = {
	context<
		TNextContext extends HttpRouteHandlerContext,
	>(): WithSseBuilderContext<TState, TPath, TNextContext>;
} & (SseRouteForState<TState, TPath> extends infer TRoute extends
	BaseRouteDeclaration
	? TRoute extends ServerHttpRouteDeclaration
		? {
				handler<const TResult extends DeclaredHandlerResult<TRoute, TContext>>(
					handler: (request: DeclaredRequest<TRoute, TContext>) => TResult,
				): RouteImplementation<
					SseRouteForState<TState, TPath>,
					(request: DeclaredRequest<TRoute, TContext>) => TResult
				>;
			}
		: EmptyObject
	: never);

interface ServerSseBuilderExtension<
	TContext extends HttpRouteHandlerContext,
> extends BuilderExtension {
	readonly result: this["state"] extends infer TState extends SseBuilderState
		? this["path"] extends infer TPath extends string
			? SseImplementationBuilder<TState, TPath, TContext>
			: never
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
