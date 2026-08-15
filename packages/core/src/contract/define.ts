import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { normalizeContract } from "./normalize.ts";
import type { ResolveRequestSchemaKeys } from "./requestKeys.ts";
import type {
	CommonOpenApiRouteOptions,
	Contract,
	OpenApiRouteOptions,
	RouteDeclaration,
	RouteMetadata,
	RouteResponses,
} from "./route.ts";
import { validateContractSync } from "./validate.ts";

export type RouteContractOptions = {
	resolveRequestKeys?: ResolveRequestSchemaKeys;
	validate?: boolean;
};

export type RouterContractOptions = RouteContractOptions & {
	pathPrefix?: string;
	metadata?: RouteMetadata;
	commonResponses?: RouteResponses;
	commonHeaders?: Record<string, StandardSchemaV1>;
	commonOpenApi?: CommonOpenApiRouteOptions;
};

type Merge<T> = {
	[K in keyof T]: T[K];
};
type EmptyObject = Record<never, never>;

type CommonResponses<TOptions> = TOptions extends {
	commonResponses: infer TResponses extends RouteResponses;
}
	? TResponses
	: EmptyObject;

type MergeResponses<TCommon, TRoute> = Merge<
	Omit<TCommon, keyof TRoute> & TRoute
>;

type CommonHeaders<TOptions> = TOptions extends {
	commonHeaders: infer THeaders extends Record<string, StandardSchemaV1>;
}
	? THeaders
	: EmptyObject;

type RouteHeadersFor<TRoute> = TRoute extends {
	headers: infer THeaders extends Record<string, StandardSchemaV1>;
}
	? THeaders
	: EmptyObject;

type MergeHeaders<TCommon, TRoute> = Merge<
	Omit<TCommon, keyof TRoute> & TRoute
>;

type ApplyCommonHeadersToRouteFields<TRoute, TOptions> =
	keyof CommonHeaders<TOptions> extends never
		? TRoute
		: Merge<
				Omit<TRoute, "headers"> & {
					headers: MergeHeaders<
						CommonHeaders<TOptions>,
						RouteHeadersFor<TRoute>
					>;
				}
			>;

type ApplyCommonHeadersToRoute<TRoute, TOptions> =
	keyof CommonHeaders<TOptions> extends never
		? TRoute
		: Merge<
				Omit<TRoute, "headers"> &
					ApplyCommonHeadersToRouteFields<TRoute, TOptions>
			>;

type ApplyRouterOptionsToRoute<TRoute extends RouteDeclaration, TOptions> =
	ApplyCommonHeadersToRoute<TRoute, TOptions> extends infer TRouteWithHeaders
		? TRouteWithHeaders extends RouteDeclaration
			? TRouteWithHeaders extends {
					responses: infer TResponses extends RouteResponses;
				}
				? Merge<
						Omit<
							TRouteWithHeaders,
							"path" | "metadata" | "openApi" | "responses"
						> & {
							path: string;
							metadata: RouteMetadata;
							openApi?: OpenApiRouteOptions;
							responses: MergeResponses<CommonResponses<TOptions>, TResponses>;
						}
					>
				: Merge<
						Omit<TRouteWithHeaders, "path" | "metadata" | "openApi"> & {
							path: string;
							metadata: RouteMetadata;
							openApi?: OpenApiRouteOptions;
						}
					>
			: never
		: never;

export type ApplyRouterOptions<
	TContract extends Contract,
	TOptions,
> = TContract extends RouteDeclaration
	? ApplyRouterOptionsToRoute<TContract, TOptions>
	: {
			[K in keyof TContract]: TContract[K] extends Contract
				? ApplyRouterOptions<TContract[K], TOptions>
				: never;
		};

export const route = <const TRoute extends RouteDeclaration>(
	route: TRoute,
	options?: RouteContractOptions,
): TRoute => {
	normalizeContract(route);
	if (options?.validate !== false) {
		validateContractSync(route, options);
	}
	return route as TRoute;
};

export const router = <
	const TContract extends Contract,
	const TOptions extends RouterContractOptions | undefined = undefined,
>(
	contract: TContract,
	commonOptions?: TOptions,
): ApplyRouterOptions<TContract, TOptions> => {
	normalizeContract(contract, commonOptions);
	if (commonOptions?.validate !== false) {
		validateContractSync(contract, commonOptions);
	}
	return contract as ApplyRouterOptions<TContract, TOptions>;
};
