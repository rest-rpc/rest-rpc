import type {
	CommonOpenApiRouteOptions,
	HttpMethod,
	OpenApiResponseOptions,
	OpenApiRouteOptions,
	RouteFactoryOptions,
	RouteRequestDeclaration,
} from "../contract/contract.ts";
import type { RequestSchemaRecord } from "../contract/request.ts";

export type EmptyObject = Record<never, never>;
export type OptionValue<TOptions, TKey extends PropertyKey, TFallback> =
	TOptions extends Record<TKey, infer TValue> ? TValue : TFallback;
export type RequestFor<TOptions> = (TOptions extends {
	headers: infer THeaders extends RequestSchemaRecord;
}
	? { headers: THeaders }
	: EmptyObject) &
	(TOptions extends { flattenRequestKeys: infer TFlatten extends boolean }
		? { flattenKeys: TFlatten }
		: EmptyObject);
export type HttpRouteFor<TOptions, TMethod extends HttpMethod> = {
	readonly method: TMethod;
} & (TOptions extends {
	strictStatusCodes: infer TStrictStatusCodes extends boolean;
}
	? { readonly strictStatusCodes: TStrictStatusCodes }
	: EmptyObject);
export type ProtocolRequestFor<TOptions> = TOptions extends {
	flattenRequestKeys: infer TFlatten extends boolean;
}
	? { flattenKeys: TFlatten }
	: EmptyObject;
export type WithRequest<
	TRequest,
	TKey extends keyof RouteRequestDeclaration,
	TValue,
> = Omit<TRequest, TKey> & Record<TKey, TValue>;

export const joinPathPrefix = (prefix: string, path: string) =>
	`${prefix}${path}`;

export const pathWithPrefix = (path: string, options: RouteFactoryOptions) =>
	options.pathPrefix ? joinPathPrefix(options.pathPrefix, path) : path;

export const httpRequestDefaults = (
	options: RouteFactoryOptions,
): RouteRequestDeclaration | undefined =>
	options.headers || typeof options.flattenRequestKeys === "boolean"
		? {
				...(options.headers ? { headers: { ...options.headers } } : {}),
				...(typeof options.flattenRequestKeys === "boolean"
					? { flattenKeys: options.flattenRequestKeys }
					: {}),
			}
		: undefined;

export const protocolRequestDefaults = (
	options: RouteFactoryOptions,
): Omit<RouteRequestDeclaration, "body" | "headers"> | undefined =>
	typeof options.flattenRequestKeys === "boolean"
		? { flattenKeys: options.flattenRequestKeys }
		: undefined;

const mergeUnique = (common: string[] = [], local: string[] = []) => [
	...new Set([...common, ...local]),
];

const mergeOpenApiResponse = (
	common: OpenApiResponseOptions | undefined,
	local: OpenApiResponseOptions | undefined,
): OpenApiResponseOptions => ({
	...common,
	...local,
	...(common?.headers || local?.headers
		? { headers: { ...common?.headers, ...local?.headers } }
		: {}),
});

export const mergeOpenApi = (
	common: CommonOpenApiRouteOptions | undefined,
	local: OpenApiRouteOptions | undefined,
): OpenApiRouteOptions | undefined => {
	if (!common && !local) return undefined;
	const statuses = new Set([
		...Object.keys(common?.responses ?? {}),
		...Object.keys(local?.responses ?? {}),
	]);

	return {
		...common,
		...local,
		...(common?.tags || local?.tags
			? { tags: mergeUnique(common?.tags, local?.tags) }
			: {}),
		...(common?.extensions || local?.extensions
			? { extensions: { ...common?.extensions, ...local?.extensions } }
			: {}),
		...(statuses.size > 0
			? {
					responses: Object.fromEntries(
						[...statuses].map((status) => [
							status,
							mergeOpenApiResponse(
								common?.responses?.[Number(status)],
								local?.responses?.[Number(status)],
							),
						]),
					),
				}
			: {}),
	};
};
