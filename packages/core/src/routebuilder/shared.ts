import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	CustomBody,
	CustomBodyContentType,
	CustomResponseBody,
} from "../contract/body.ts";
import type {
	CommonOpenApiRouteOptions,
	OpenApiResponseOptions,
	OpenApiRouteOptions,
	RouteFactoryOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "../contract/contract.ts";
import type { RequestSchemaRecord } from "../contract/request.ts";

export type Simplify<T> = { [K in keyof T]: T[K] };
export type EmptyObject = Record<never, never>;
export type Merge<TCommon, TLocal> = Simplify<
	Omit<TCommon, keyof TLocal> & TLocal
>;
export type JoinPath<
	TPrefix extends string,
	TPath extends string,
> = `${TPrefix}${TPath}`;
export type OptionValue<TOptions, TKey extends PropertyKey, TFallback> =
	TOptions extends Record<TKey, infer TValue> ? TValue : TFallback;
export type PathFor<TOptions, TPath extends string> = TOptions extends {
	pathPrefix: infer TPrefix extends string;
}
	? JoinPath<TPrefix, TPath>
	: TPath;
export type RequestFor<TOptions> = Simplify<
	(TOptions extends { headers: infer THeaders extends RequestSchemaRecord }
		? { headers: THeaders }
		: EmptyObject) &
		(TOptions extends { flattenRequestKeys: infer TFlatten extends boolean }
			? { flattenKeys: TFlatten }
			: EmptyObject)
>;
export type ProtocolRequestFor<TOptions> = Simplify<
	TOptions extends { flattenRequestKeys: infer TFlatten extends boolean }
		? { flattenKeys: TFlatten }
		: EmptyObject
>;
export type WithRequest<
	TRequest,
	TKey extends keyof RouteRequestDeclaration,
	TValue,
> = Simplify<Omit<TRequest, TKey> & Record<TKey, TValue>>;

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

export const installCallableDefault = (
	target: object,
	setter: "metadata" | "openApi",
	value: object | undefined,
) => {
	if (!value) return;
	const callable = Object.assign(
		(
			(target as Record<string, unknown>)[setter] as (
				value: RouteMetadata | OpenApiRouteOptions,
			) => unknown
		).bind(target),
		value,
	);
	Object.defineProperty(target, setter, {
		value: callable,
		writable: true,
		enumerable: true,
		configurable: true,
	});
};

export type CustomResponseBodyFor<
	TSchema extends StandardSchemaV1,
	TContentType extends CustomBodyContentType,
> = CustomBody<TSchema, TContentType> & CustomResponseBody;
