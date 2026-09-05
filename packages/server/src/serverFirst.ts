import type {
	BaseRouteDeclaration,
	BuilderExtension,
	BuilderMetadata,
	CustomResponseBody,
	HttpBuilderAtPath,
	HttpBuilderDeclaration,
	HttpBuilderFor,
	HttpBuilderState,
	HttpMethod,
	NoBody,
	RouteFactoryOptions,
	RouteMetadata,
	ServerRequest,
	SseBuilderAtPath,
	SseBuilderDeclaration,
	SseBuilderFor,
	SseBuilderState,
	Stream,
} from "@rest-rpc/core/contract";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
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

/** A server-first implementation carrying erased client route metadata. */
export type ServerRouteImplementation<
	TRoute = BaseRouteDeclaration,
	THandler = AnyRouteHandler,
	TClientRoute = TRoute,
> = RouteImplementation<TRoute, THandler> & {
	readonly clientRoute?: TClientRoute;
};

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
	TImplementation extends ServerRouteImplementation<
		infer TRoute,
		infer THandler,
		unknown
	>
		? { route: TRoute; handler: THandler }
		: never;

type HandlerResult<THandler> = THandler extends AnyRouteHandler
	? Awaited<ReturnType<THandler>>
	: never;

type ClientSchema<TOutput> = StandardSchemaV1<unknown, TOutput>;

type ImplicitResponseDeclaration<TResponse> = TResponse extends {
	body: infer TBody;
}
	? TBody extends AsyncIterable<infer TItem>
		? TResponse extends { contentType: infer TContentType extends string }
			? Stream<CustomResponseBody<ClientSchema<TItem>, TContentType>>
			: Stream<ClientSchema<TItem>>
		: TResponse extends { contentType: infer TContentType extends string }
			? CustomResponseBody<ClientSchema<TBody>, TContentType>
			: ClientSchema<TBody>
	: NoBody;

type ResponseStatuses<TResponse> = TResponse extends {
	status: infer TStatus extends number;
}
	? TStatus
	: never;

type InferredResponses<TResponse> = {
	[TStatus in ResponseStatuses<TResponse>]: ImplicitResponseDeclaration<
		Extract<TResponse, { status: TStatus }>
	>;
};

type InferredClientRoute<TRoute, TResult> = Omit<TRoute, "responses"> & {
	responses: InferredResponses<Awaited<TResult>>;
};

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
	TMetadata extends RouteMetadata | never,
	TContext extends HttpRouteHandlerContext,
> = HttpBuilderAtPath<
	Omit<TState, "extension"> & {
		extension: ServerHttpBuilderExtension<TContext>;
	},
	TPath,
	TMetadata
>;

type HttpRouteForState<
	TState extends HttpBuilderState,
	TPath extends string,
	TMetadata extends RouteMetadata | never,
> = HttpBuilderDeclaration<TState> & {
	readonly path: TPath;
} & BuilderMetadata<TMetadata>;

type HttpImplementationBuilder<
	TState extends HttpBuilderState,
	TPath extends string,
	TMetadata extends RouteMetadata | never,
	TContext extends HttpRouteHandlerContext,
> = {
	$context<
		TNextContext extends HttpRouteHandlerContext,
	>(): WithHttpBuilderContext<TState, TPath, TMetadata, TNextContext>;
} & (HttpBuilderDeclaration<TState> extends infer TRoute extends
	BaseRouteDeclaration
	? TRoute extends ServerHttpRouteDeclaration
		? {
				handler<const TResult extends DeclaredHandlerResult<TRoute, TContext>>(
					handler: (request: DeclaredRequest<TRoute, TContext>) => TResult,
				): ServerRouteImplementation<
					HttpRouteForState<TState, TPath, TMetadata>,
					(request: DeclaredRequest<TRoute, TContext>) => TResult
				>;
			}
		: {
				handler<const TResult extends MaybePromise<ImplicitResponseEnvelope>>(
					handler: (request: ServerFirstRequest<TRoute, TContext>) => TResult,
				): ServerRouteImplementation<
					HttpRouteForState<TState, TPath, TMetadata>,
					(request: ServerFirstRequest<TRoute, TContext>) => TResult,
					InferredClientRoute<
						HttpRouteForState<TState, TPath, TMetadata>,
						TResult
					>
				>;
			}
	: never);

interface ServerHttpBuilderExtension<
	TContext extends HttpRouteHandlerContext,
> extends BuilderExtension {
	readonly result: this["state"] extends infer TState extends HttpBuilderState
		? this["path"] extends infer TPath extends string
			? HttpImplementationBuilder<
					TState,
					TPath,
					Extract<this["metadata"], RouteMetadata>,
					TContext
				>
			: never
		: never;
}

type WithSseBuilderContext<
	TState extends SseBuilderState,
	TPath extends string,
	TMetadata extends RouteMetadata | never,
	TContext extends HttpRouteHandlerContext,
> = SseBuilderAtPath<
	Omit<TState, "extension"> & {
		extension: ServerSseBuilderExtension<TContext>;
	},
	TPath,
	TMetadata
>;

type SseRouteForState<
	TState extends SseBuilderState,
	TPath extends string,
	TMetadata extends RouteMetadata | never,
> = SseBuilderDeclaration<TState> & {
	readonly path: TPath;
} & BuilderMetadata<TMetadata> &
	([TState["response"]] extends [never]
		? EmptyObject
		: { responses: { 200: TState["response"] } });

type SseImplementationBuilder<
	TState extends SseBuilderState,
	TPath extends string,
	TMetadata extends RouteMetadata | never,
	TContext extends HttpRouteHandlerContext,
> = {
	$context<
		TNextContext extends HttpRouteHandlerContext,
	>(): WithSseBuilderContext<TState, TPath, TMetadata, TNextContext>;
} & (SseRouteForState<TState, TPath, TMetadata> extends infer TRoute extends
	BaseRouteDeclaration
	? TRoute extends ServerHttpRouteDeclaration
		? {
				handler<const TResult extends DeclaredHandlerResult<TRoute, TContext>>(
					handler: (request: DeclaredRequest<TRoute, TContext>) => TResult,
				): ServerRouteImplementation<
					SseRouteForState<TState, TPath, TMetadata>,
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
			? SseImplementationBuilder<
					TState,
					TPath,
					Extract<this["metadata"], RouteMetadata>,
					TContext
				>
			: never
		: never;
}

type ServerRouteOptions<TOptions extends RouteFactoryOptions> = Omit<
	{ flattenRequestKeys: true },
	keyof TOptions
> &
	TOptions;

/** Type-level model of the server-first HTTP and SSE route factory. */
export type ServerRouteFactory<
	TOptions extends RouteFactoryOptions = { flattenRequestKeys: true },
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
	$context<
		TNextContext extends HttpRouteHandlerContext,
	>(): ImplementationBuilder<TRoute, TNextContext>;
	handler<const TResult extends DeclaredHandlerResult<TRoute, TContext>>(
		handler: (request: DeclaredRequest<TRoute, TContext>) => TResult,
	): ServerRouteImplementation<
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

/** An ordinary object tree containing server-first route implementations. */
export type ServerImplementationTree =
	| ServerRouteImplementation<
			BaseRouteDeclaration,
			AnyRouteHandler,
			ServerHttpRouteDeclaration
	  >
	| { readonly [key: string]: ServerImplementationTree };
