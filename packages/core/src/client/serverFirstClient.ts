import type { HttpMethod } from "../contract/routeDeclaration.ts";
import type { RouteDeclaration } from "../contract/contract.ts";
import { executeRequest, type ExecuteRequestOptions } from "./request.ts";
import type {
	ClientRequestDeclaration,
	ClientRequestRoute,
} from "./requestRoute.ts";
import { readServerFirstResponse } from "./response.ts";
import type {
	ApiClientOptions,
	ApiClientRouteValue,
	FetchOptions,
	HeaderRecord,
} from "./types.ts";

type AnyHandler = (...args: never[]) => unknown;
type ServerFirstRuntimeRoute = RouteDeclaration;

type ServerFirstImplementation = {
	readonly "~restrpc": ServerFirstRuntimeRoute & {
		readonly handler: AnyHandler;
	};
};

type ServerFirstProcedureImplementation = {
	readonly "~restrpc": RouteDeclaration & {
		kind: "procedure";
		readonly handler: AnyHandler;
	};
};

type ServerFirstRequestDeclaration<TRequest> = TRequest extends object
	? Omit<TRequest, "body" | "contentType"> &
			(TRequest extends { body: infer TBody } ? { body: TBody } : unknown) &
			(TRequest extends { contentType: infer TContentType }
				? {
						contentType: TContentType extends "application/json"
							? TContentType
							: TContentType extends string
								? readonly [TContentType]
								: TContentType;
					}
				: unknown)
	: never;

type ImplementationUnion<TTree> = TTree extends {
	readonly "~restrpc": { readonly handler: AnyHandler };
}
	? TTree extends ServerFirstImplementation
		? TTree["~restrpc"] extends { kind: "http" }
			? TTree
			: never
		: never
	: TTree extends object
		? { [TKey in keyof TTree]: ImplementationUnion<TTree[TKey]> }[keyof TTree]
		: never;

type SelectorName<TImplementation> = TImplementation extends {
	readonly "~restrpc": infer TRoute extends ServerFirstRuntimeRoute;
}
	? `$${Lowercase<TRoute["method"]>}`
	: never;

type SelectorPath<
	TImplementation,
	TSelector extends string,
> = TImplementation extends {
	readonly "~restrpc": infer TRoute extends ServerFirstRuntimeRoute;
}
	? SelectorName<TImplementation> extends TSelector
		? TRoute["path"]
		: never
	: never;

/** Infers the available client selectors from a server implementation tree. */
export type ServerFirstClientSelector<TTree> = SelectorName<
	ImplementationUnion<TTree>
>;

/** Infers the paths available for a server-first client selector. */
export type ServerFirstClientPath<
	TTree,
	TSelector extends string,
> = SelectorPath<ImplementationUnion<TTree>, TSelector>;

type SelectedImplementation<
	TImplementation,
	TSelector extends string,
	TPath extends string,
> = TImplementation extends {
	readonly "~restrpc": infer TRoute extends ServerFirstRuntimeRoute;
}
	? SelectorName<TImplementation> extends TSelector
		? TRoute["path"] extends TPath
			? TImplementation
			: never
		: never
	: never;

type GroupedRequest<TRoute extends RouteDeclaration> = TRoute extends {
	request: infer TRequest;
}
	? { request: ServerFirstRequestDeclaration<TRequest> }
	: { request?: never };

type ClientRoute<TImplementation> = TImplementation extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration;
}
	? Omit<TRoute, "request" | "handler"> &
			GroupedRequest<TRoute> extends infer TClientRoute extends RouteDeclaration
		? TClientRoute
		: never
	: never;

/** Infers the normalized client route selected from a server implementation tree. */
export type ServerFirstClientRouteFor<
	TTree,
	TSelector extends string,
	TPath extends string,
> = ClientRoute<
	SelectedImplementation<ImplementationUnion<TTree>, TSelector, TPath>
>;

type ServerFirstClientCallArgs<
	TRoute extends RouteDeclaration,
	TGlobalHeaders extends HeaderRecord,
> =
	ApiClientRouteValue<TRoute, TGlobalHeaders> extends (
		...args: infer TArgs
	) => unknown
		? TArgs
		: [];

type ServerFirstClientCallResult<
	TRoute extends RouteDeclaration,
	TGlobalHeaders extends HeaderRecord,
> =
	ApiClientRouteValue<TRoute, TGlobalHeaders> extends (
		...args: infer _TArgs
	) => infer TResult
		? TResult
		: ApiClientRouteValue<TRoute, TGlobalHeaders>;

/**
 * Infers the method-and-path and procedure client for a server implementation tree.
 *
 * @remarks Explicit HTTP routes are selected by method and literal path.
 * Procedure routes retain the object-tree shape of the implementation.
 *
 * @see {@link https://rest-rpc.dev/docs/server-first/client#derive-routes-from-the-server}
 */
export type ServerFirstClientFor<
	TTree,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = {
	[TSelector in ServerFirstClientSelector<TTree>]: <
		const TPath extends ServerFirstClientPath<TTree, TSelector>,
	>(
		path: TPath,
		...args: ServerFirstClientCallArgs<
			ServerFirstClientRouteFor<TTree, TSelector, Extract<TPath, string>>,
			TGlobalHeaders
		>
	) => ServerFirstClientCallResult<
		ServerFirstClientRouteFor<TTree, TSelector, Extract<TPath, string>>,
		TGlobalHeaders
	>;
} & ([ServerFirstShorthandClientTree<TTree>] extends [never]
	? Record<never, never>
	: ServerFirstShorthandClientTree<TTree>);

type ServerFirstShorthandClientObject<TNode extends object> = {
	[
		TKey in keyof TNode as ServerFirstShorthandClientTree<
			TNode[TKey]
		> extends never
			? never
			: TKey
	]: ServerFirstShorthandClientTree<TNode[TKey]>;
};

type ServerFirstShorthandClientTree<TNode> = unknown extends TNode
	? never
	: TNode extends {
				readonly "~restrpc": { readonly handler: AnyHandler };
		  }
		? TNode extends ServerFirstProcedureImplementation
			? ClientRoute<TNode> extends infer TRoute extends RouteDeclaration & {
					kind: "procedure";
				}
				? ApiClientRouteValue<TRoute>
				: never
			: never
		: TNode extends object
			? ServerFirstShorthandClientObject<TNode> extends infer TTree
				? keyof TTree extends never
					? never
					: TTree
				: never
			: never;

/**
 * Options used to create a server-first Fetch client.
 *
 * @remarks The server implementation is a type-only client dependency, so
 * client-side response validation is not available. At runtime, the client
 * uses the response Content-Type to select a body parser.
 *
 * @see {@link https://rest-rpc.dev/docs/server-first/client}
 */
export type ServerFirstClientOptions<
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = Omit<ApiClientOptions<TGlobalHeaders>, "validateResponses">;

type ServerFirstRequestInput = {
	body?: unknown;
	query?: unknown;
	params?: Record<string, unknown>;
	headers?: Record<string, unknown>;
};

const getServerFirstArgs = (args: unknown[]) => {
	return {
		requestInput: args[0] as ServerFirstRequestInput | undefined,
		fetchOptions: args[1] as FetchOptions | undefined,
	};
};

const createRuntimeRoute = (
	method: HttpMethod,
	path: string,
	input: ServerFirstRequestInput | undefined,
	contentType: string | undefined,
) => {
	const requestDeclaration: ClientRequestDeclaration = {};

	if (input && "body" in input) {
		requestDeclaration.body = {};
		requestDeclaration.contentType = contentType ?? "application/json";
	}

	if (input && "query" in input) {
		requestDeclaration.query = {};
	}

	if (input && "params" in input) {
		requestDeclaration.params = {};
	}
	if (input && "headers" in input) {
		requestDeclaration.headers = {};
	}

	return {
		route: {
			method,
			path,
			request: requestDeclaration,
		} satisfies ClientRequestRoute,
		requestInput: input,
	};
};

const selectorMethod = (selector: string): HttpMethod => {
	const method = selector.toUpperCase();
	if (["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method)) {
		return method as HttpMethod;
	}
	throw new Error(`Unsupported server-first client selector "${selector}".`);
};

const executeShorthandRequest = async (
	path: string[],
	args: unknown[],
	requestOptions: ExecuteRequestOptions,
	bodyParser: ApiClientOptions["bodyParser"],
) => {
	const input = args[0];
	const fetchOptions = args[1] as FetchOptions | undefined;
	const hasInput = input !== undefined;
	const route: ClientRequestRoute = {
		method: "POST",
		path: `/${path.join("/")}`,
		...(hasInput
			? {
					request: {
						body: {},
						contentType: fetchOptions?.contentType ?? "application/json",
					},
				}
			: {}),
	};
	const rawResponse = await executeRequest(
		route,
		path,
		[hasInput ? { body: input } : undefined, fetchOptions],
		requestOptions,
	);
	const response = await readServerFirstResponse(rawResponse, bodyParser);
	if (response.status < 200 || response.status >= 300) {
		throw new Error("Request did not return a declared success response");
	}
	return response.body;
};

export const createServerFirstClient = <
	const TTree,
	const TGlobalHeaders extends HeaderRecord = Record<never, string>,
>(
	options: ServerFirstClientOptions<TGlobalHeaders>,
): ServerFirstClientFor<TTree, TGlobalHeaders> => {
	const requestOptions: ExecuteRequestOptions = {
		...options,
	};
	const createShorthandNamespace = (path: string[]): unknown =>
		new Proxy(
			(...args: unknown[]) =>
				executeShorthandRequest(path, args, requestOptions, options.bodyParser),
			{
				get: (_target, key) =>
					typeof key === "string" && key !== "then"
						? createShorthandNamespace([...path, key])
						: undefined,
			},
		);

	return new Proxy(
		{},
		{
			get: (_target, selectorKey) => {
				if (typeof selectorKey !== "string") return undefined;
				if (!selectorKey.startsWith("$")) {
					return createShorthandNamespace([selectorKey]);
				}
				const selector = selectorKey.slice(1);

				return (path: string, ...args: unknown[]) => {
					const method = selectorMethod(selector);
					const { requestInput, fetchOptions } = getServerFirstArgs(args);
					const runtime = createRuntimeRoute(
						method,
						path,
						requestInput,
						fetchOptions?.contentType,
					);
					return executeRequest(
						runtime.route,
						runtime.route,
						[runtime.requestInput, fetchOptions],
						requestOptions,
						runtime.requestInput,
					).then((response) =>
						readServerFirstResponse(response, options.bodyParser),
					);
				};
			},
		},
	) as ServerFirstClientFor<TTree, TGlobalHeaders>;
};
