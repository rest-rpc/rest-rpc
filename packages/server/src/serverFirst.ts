import type {
	BuilderExtension,
	BuilderMetadata,
	CustomResponseBody,
	CustomResponseValue,
	HttpBuilderDeclaration,
	HttpBuilderFor,
	HttpBuilderState,
	HttpMethod,
	NoBody,
	RouteDeclaration,
	RouteFactoryOptions,
	RouteMetadata,
	ServerRequest,
	Stream,
} from "@rest-rpc/core/contract";
import { route as coreRoute } from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import type {
	HttpRouteHandlerContext,
	RouteHandler,
	RouteImplementation,
	RouteRequest,
	RuntimeRouteHandler,
} from "./router.ts";
import { isRouteDeclaration } from "./router.ts";

type EmptyObject = Record<never, never>;
type AnyRouteHandler = (...args: never[]) => unknown;
type MaybePromise<T> = T | Promise<T>;
type RouteBuilderValue = RouteDeclaration;

type ProcedureRouteFor<
	TInput extends StandardSchemaV1 | never,
	TOutput extends StandardSchemaV1,
> = {
	kind: "procedure";
	path: string;
	method: "POST";
	responses: { 200: TOutput };
} & ([TInput] extends [never]
	? { request?: never }
	: { request: { body: TInput } });

interface ContextShape {
	// oxlint-disable-next-line typescript/no-explicit-any -- `any` allows named interfaces without leaking an index signature.
	[key: string]: any;
}
type ServerFirstContext<TContext extends ContextShape> = TContext & {
	signal: AbortSignal;
};

type ShorthandRequest<
	TInput extends StandardSchemaV1 | never,
	TContext extends ContextShape,
> = Merge<
	([TInput] extends [never]
		? EmptyObject
		: {
				input: StandardSchemaV1.InferOutput<Extract<TInput, StandardSchemaV1>>;
			}) & {
		context: ServerFirstContext<TContext>;
	}
>;

type InferredShorthandRoute<
	TInput extends StandardSchemaV1 | never,
	TResult,
> = ProcedureRouteFor<TInput, StandardSchemaV1<unknown, Awaited<TResult>>>;

/**
 * A server-first shorthand builder that can declare input or output before its
 * handler.
 */
export type ServerShorthandImplementationBuilder<
	TInput extends StandardSchemaV1 | never,
	TOutput extends StandardSchemaV1 | never,
	TContext extends ContextShape,
> = ([TOutput] extends [never]
	? {
			handler<const TResult>(
				handler: (request: ShorthandRequest<TInput, TContext>) => TResult,
			): ServerRouteImplementation<
				InferredShorthandRoute<TInput, TResult>,
				(request: ShorthandRequest<TInput, TContext>) => TResult,
				InferredShorthandRoute<TInput, TResult>
			>;
		}
	: {
			handler<
				const TResult extends MaybePromise<
					StandardSchemaV1.InferInput<Extract<TOutput, StandardSchemaV1>>
				>,
			>(
				handler: (request: ShorthandRequest<TInput, TContext>) => TResult,
			): ServerRouteImplementation<
				ProcedureRouteFor<TInput, Extract<TOutput, StandardSchemaV1>>,
				(request: ShorthandRequest<TInput, TContext>) => TResult,
				ProcedureRouteFor<TInput, Extract<TOutput, StandardSchemaV1>>
			>;
		}) &
	([TInput] extends [never]
		? {
				input<const TNextInput extends StandardSchemaV1>(
					schema: TNextInput,
				): ServerShorthandImplementationBuilder<TNextInput, TOutput, TContext>;
			}
		: EmptyObject) &
	([TOutput] extends [never]
		? {
				output<const TNextOutput extends StandardSchemaV1>(
					schema: TNextOutput,
				): ServerShorthandImplementationBuilder<TInput, TNextOutput, TContext>;
			}
		: EmptyObject);

/** A server-first implementation carrying erased client route metadata. */
export interface ServerRouteImplementation<
	TRoute = RouteBuilderValue,
	THandler = AnyRouteHandler,
	TClientRoute = TRoute,
> extends RouteImplementation<TRoute, THandler> {
	readonly clientRoute?: TClientRoute;
}

/** Explicit HTTP response envelope accepted from an inferred route handler. */
export type ImplicitResponseEnvelope =
	| {
			status: number;
			body?: never;
			contentType?: string;
			responseHeaders?: Record<string, string | number | undefined>;
	  }
	| {
			status: number;
			body: unknown;
			contentType?: string;
			responseHeaders?: Record<string, string | number | undefined>;
	  };

/** Wire response classifications available to server-first HTTP routes. */
export type ServerFirstResponseKind =
	| "empty"
	| "json"
	| "ndjson"
	| "custom"
	| "custom-stream";

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

type HasDeclaredResponses<TRoute> = TRoute extends {
	responses: infer TResponses;
}
	? keyof TResponses extends never
		? false
		: true
	: false;

type ClientSchema<TOutput> = StandardSchemaV1<unknown, TOutput>;

type SerializedResponseHeader<TValue> = TValue extends string
	? TValue
	: TValue extends number
		? `${TValue}`
		: TValue extends undefined
			? undefined
			: never;

type SerializedResponseHeaders<THeaders> = {
	[TKey in keyof THeaders]: SerializedResponseHeader<THeaders[TKey]>;
};

type ImplicitResponseBodyDeclaration<TResponse> = TResponse extends {
	body: infer TBody;
}
	? TBody extends AsyncIterable<infer TItem>
		? TResponse extends { contentType: infer TContentType extends string }
			? Stream<
					CustomResponseBody<ClientSchema<CustomResponseValue>, TContentType>
				>
			: Stream<ClientSchema<TItem>>
		: TResponse extends { contentType: infer TContentType extends string }
			? CustomResponseBody<ClientSchema<CustomResponseValue>, TContentType>
			: ClientSchema<TBody>
	: NoBody;

type ImplicitResponseDeclaration<TResponse> =
	ImplicitResponseBodyDeclaration<TResponse> extends infer TBody
		? TResponse extends { responseHeaders: infer THeaders }
			? {
					body: TBody;
					headers: ClientSchema<SerializedResponseHeaders<THeaders>>;
				}
			: TBody
		: never;

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
		? HasDeclaredResponses<TRoute> extends true
			? never
			: HandlerResult<THandler>
		: never;

/** Infers the wire response kinds represented by a server-first implementation. */
export type ServerFirstRouteResponseKind<TImplementation> =
	ImplementationParts<TImplementation> extends {
		route: infer TRoute;
		handler: infer THandler;
	}
		? TRoute extends { kind: "procedure" }
			? "json"
			: HasDeclaredResponses<TRoute> extends true
				? never
				: ImplicitResponseKind<HandlerResult<THandler>>
		: never;

type Merge<T> = {
	[K in keyof T]: T[K];
};

type ServerFirstRequest<
	TRoute extends RouteBuilderValue,
	TContext extends ContextShape,
> = Merge<
	(ServerRequest<TRoute> extends never
		? EmptyObject
		: ServerRequest<TRoute>) & {
		context: ServerFirstContext<TContext>;
	}
>;

type DeclaredRequest<
	TRoute extends RouteDeclaration,
	TContext extends ContextShape,
> = Merge<
	RouteRequest<TRoute, ServerFirstContext<TContext> & HttpRouteHandlerContext>
>;

type DeclaredHandlerResult<
	TRoute extends RouteDeclaration,
	TContext extends ContextShape,
> = ReturnType<RouteHandler<TRoute, TContext & HttpRouteHandlerContext>>;

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
	TContext extends ContextShape,
> =
	HttpBuilderDeclaration<TState> extends infer TRoute extends RouteBuilderValue
		? keyof TState["responses"] extends never
			? {
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
			: TRoute extends RouteDeclaration
				? {
						handler<
							const TResult extends DeclaredHandlerResult<TRoute, TContext>,
						>(
							handler: (request: DeclaredRequest<TRoute, TContext>) => TResult,
						): ServerRouteImplementation<
							HttpRouteForState<TState, TPath, TMetadata>,
							(request: DeclaredRequest<TRoute, TContext>) => TResult
						>;
					}
				: never
		: never;

/** Core HTTP builder extension carrying server handler attachment operations. */
export interface ServerHttpBuilderExtension<
	TContext extends ContextShape,
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

type ServerRouteOptions<TOptions extends RouteFactoryOptions> = Omit<
	Record<never, never>,
	keyof TOptions
> &
	TOptions;

type ServerConfiguredRouteFactory<
	TOptions extends RouteFactoryOptions = Record<never, never>,
	TContext extends ContextShape = EmptyObject,
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
	with<const TNextOptions extends RouteFactoryOptions>(
		options: TNextOptions,
	): ServerConfiguredRouteFactory<ServerRouteOptions<TNextOptions>, TContext>;
};

/** Type-level model of the server-first HTTP and shorthand route factory. */
export type ServerRouteFactory<
	TOptions extends RouteFactoryOptions = Record<never, never>,
	TContext extends ContextShape = EmptyObject,
> = ServerConfiguredRouteFactory<TOptions, TContext> & {
	/** Starts a shorthand route whose HTTP method and path come from its tree. */
	handler: ServerShorthandImplementationBuilder<
		never,
		never,
		TContext
	>["handler"];
	/** Declares the shorthand route's JSON request body schema. */
	input<const TInput extends StandardSchemaV1>(
		schema: TInput,
	): ServerShorthandImplementationBuilder<TInput, never, TContext>;
	/** Declares the shorthand route's `200` JSON response schema. */
	output<const TOutput extends StandardSchemaV1>(
		schema: TOutput,
	): ServerShorthandImplementationBuilder<never, TOutput, TContext>;
};

type ImplementationBuilder<
	TRoute extends RouteDeclaration,
	TContext extends ContextShape,
> = {
	handler<const TResult extends DeclaredHandlerResult<TRoute, TContext>>(
		handler: (request: DeclaredRequest<TRoute, TContext>) => TResult,
	): ServerRouteImplementation<
		TRoute,
		(request: DeclaredRequest<TRoute, TContext>) => TResult
	>;
};

/** An HTTP contract route or nested contract tree supported by `implement`. */
export type ServerContract =
	| RouteDeclaration
	| { readonly [key: string]: ServerContract };

/** Maps a contract route or tree to handler attachment builders. */
export type ImplementationBuildersFor<
	TNode extends ServerContract,
	TContext extends ContextShape = EmptyObject,
> = TNode extends RouteDeclaration
	? TNode extends { kind: "procedure" }
		? ServerShorthandImplementationBuilder<
				TNode extends {
					request: { body: infer TInput extends StandardSchemaV1 };
				}
					? TInput
					: never,
				TNode extends { responses: { 200: infer TOutput } }
					? Extract<TOutput, StandardSchemaV1>
					: never,
				TContext
			>
		: ImplementationBuilder<TNode, TContext>
	: {
			readonly [K in keyof TNode]: TNode[K] extends ServerContract
				? ImplementationBuildersFor<TNode[K], TContext>
				: never;
		};

/** Type-level model of contract-first handler attachment. */
export type Implement<TContext extends ContextShape = EmptyObject> = <
	const TNode extends ServerContract,
>(
	contract: TNode,
) => ImplementationBuildersFor<TNode, TContext>;

/** An ordinary object tree containing server-first route implementations. */
export type ServerImplementationTree =
	| ServerRouteImplementation<
			RouteBuilderValue,
			AnyRouteHandler,
			RouteDeclaration
	  >
	| { readonly [key: string]: ServerImplementationTree };

const attachHandler = (
	route: RouteBuilderValue,
	handler: RuntimeRouteHandler,
): RouteImplementation<RouteBuilderValue> => ({
	route,
	handler,
});

const extendBuilder = (builder: RouteBuilderValue) =>
	Object.assign(builder, {
		handler(handler: RuntimeRouteHandler) {
			return attachHandler(builder, handler);
		},
	});

const inferredOutputSchema: StandardSchemaV1 = {
	"~standard": {
		version: 1,
		vendor: "rest-rpc",
		validate: (value) => ({ value }),
	},
};

type RuntimeProcedureBuilder = RouteBuilderValue & {
	kind: "procedure";
	responses: Record<number, StandardSchemaV1>;
	output(schema: StandardSchemaV1): RuntimeProcedureBuilder;
};

const extendProcedureBuilder = (builder: RuntimeProcedureBuilder) =>
	Object.assign(builder, {
		handler(handler: RuntimeRouteHandler) {
			if (!builder.responses[200]) {
				builder.output(inferredOutputSchema);
			}
			return attachHandler(builder, handler);
		},
	});

const createServerRouteFactory = (options: RouteFactoryOptions = {}) => {
	const resolvedOptions = { ...options };
	const factory = coreRoute.with(resolvedOptions);

	return {
		get: (path: string) => extendBuilder(factory.get(path)),
		post: (path: string) => extendBuilder(factory.post(path)),
		put: (path: string) => extendBuilder(factory.put(path)),
		patch: (path: string) => extendBuilder(factory.patch(path)),
		delete: (path: string) => extendBuilder(factory.delete(path)),
		handler: (handler: RuntimeRouteHandler) =>
			attachHandler(coreRoute.output(inferredOutputSchema), handler),
		input: (schema: StandardSchemaV1) =>
			extendProcedureBuilder(
				coreRoute.input(schema) as unknown as RuntimeProcedureBuilder,
			),
		output: (schema: StandardSchemaV1) =>
			extendProcedureBuilder(
				coreRoute.output(schema) as unknown as RuntimeProcedureBuilder,
			),
		with: (nextOptions: RouteFactoryOptions) =>
			createServerRouteFactory(nextOptions),
	};
};

const serverRouteFactory = createServerRouteFactory();

/** Core route builders extended with terminal server-first handler attachment. */
export const serverFirstRoute =
	serverRouteFactory as unknown as ServerRouteFactory;

const createImplementationBuilder = (contract: RouteDeclaration) => {
	const builder = {
		handler: (handler: RuntimeRouteHandler) => attachHandler(contract, handler),
	};
	return builder;
};

const implementationBuildersFor = (contract: ServerContract): unknown => {
	if (isRouteDeclaration(contract)) {
		return createImplementationBuilder(contract);
	}

	return Object.fromEntries(
		Object.entries(contract).map(([key, child]) => [
			key,
			implementationBuildersFor(child),
		]),
	);
};

/** Creates handler-attachment builders for an HTTP contract route or tree. */
export function implement<const TNode extends ServerContract>(
	contract: TNode,
): ImplementationBuildersFor<TNode> {
	return implementationBuildersFor(
		contract,
	) as ImplementationBuildersFor<TNode>;
}
