import type { BaseRouteDeclaration } from "../contract/baseRouteDeclaration.ts";
import type { HttpMethod } from "../contract/baseRouteDeclaration.ts";
import type { RouteDeclaration } from "../contract/contract.ts";
import type {
	ApiClientOptions,
	ApiClientRouteValue,
	HeaderRecord,
} from "./types.ts";

type AnyHandler = (...args: never[]) => unknown;

type ServerFirstRoute = BaseRouteDeclaration & {
	readonly method: HttpMethod;
	readonly path: string;
};

type ServerFirstImplementation = {
	readonly route: ServerFirstRoute;
	readonly handler: AnyHandler;
	readonly clientRoute?: RouteDeclaration;
};

type ImplementationUnion<TTree> = TTree extends ServerFirstImplementation
	? TTree
	: TTree extends object
		? { [TKey in keyof TTree]: ImplementationUnion<TTree[TKey]> }[keyof TTree]
		: never;

type SelectorName<TImplementation> = TImplementation extends {
	route: infer TRoute extends ServerFirstRoute;
}
	? TRoute extends { mode: "sse" }
		? "sse"
		: Lowercase<TRoute["method"]>
	: never;

type SelectorPath<
	TImplementation,
	TSelector extends string,
> = TImplementation extends {
	route: infer TRoute extends ServerFirstRoute;
}
	? SelectorName<TImplementation> extends TSelector
		? TRoute["path"]
		: never
	: never;

type SelectedImplementation<
	TImplementation,
	TSelector extends string,
	TPath extends string,
> = TImplementation extends {
	route: infer TRoute extends ServerFirstRoute;
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
	? { request: Omit<TRequest, "flattenKeys"> & { flattenKeys: false } }
	: { request?: never };

type ClientRoute<TImplementation> = TImplementation extends {
	clientRoute?: infer TRoute extends RouteDeclaration;
}
	? Omit<TRoute, "request" | "strictStatusCodes"> &
			GroupedRequest<TRoute> & {
				strictStatusCodes: true;
			} extends infer TClientRoute extends RouteDeclaration
		? TClientRoute
		: never
	: never;

/** Infers the method-and-path client for a server implementation tree. */
export type ServerFirstClientFor<
	TTree,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> =
	ImplementationUnion<TTree> extends infer TImplementations
		? {
				[TSelector in SelectorName<TImplementations>]: <
					const TPath extends SelectorPath<TImplementations, TSelector>,
				>(
					path: TPath,
				) => ApiClientRouteValue<
					ClientRoute<
						SelectedImplementation<TImplementations, TSelector, TPath>
					>,
					TGlobalHeaders
				>;
			}
		: never;

/** Type-level initializer shape for the server-first Fetch client. */
export type ServerFirstClientInitializer = <
	const TTree,
	const TGlobalHeaders extends HeaderRecord = Record<never, string>,
>(
	options: ApiClientOptions<TGlobalHeaders>,
) => ServerFirstClientFor<TTree, TGlobalHeaders>;
