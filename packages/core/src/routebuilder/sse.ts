import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	OpenApiRouteOptions,
	RouteFactoryOptions,
	RouteMetadata,
} from "../contract/contract.ts";
import type { JsonQuery, RequestKeys } from "../contract/request.ts";
import { BaseRouteBuilder } from "./base.ts";
import type {
	EmptyObject,
	Merge,
	OptionValue,
	PathFor,
	ProtocolRequestFor,
	Simplify,
	WithRequest,
} from "./shared.ts";
import { protocolRequestDefaults } from "./shared.ts";

class SseRouteBuilder extends BaseRouteBuilder {
	constructor(path: string, options?: RouteFactoryOptions) {
		super(
			"GET",
			path,
			options ?? {},
			protocolRequestDefaults(options ?? {}),
			"sse",
		);
	}

	response(schema: StandardSchemaV1) {
		Object.assign(this, { response: schema });
		return this;
	}
}

type SseRequestSetters<
	TPath extends string,
	TRequest,
	TMetadata,
	TOpenApi,
	TUsed extends string,
	TResponse,
> = ("query" extends TUsed
	? EmptyObject
	: {
			query<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): SseBuilder<
				TPath,
				WithRequest<TRequest, "query", TSchema>,
				TMetadata,
				TOpenApi,
				TUsed | "query",
				TResponse
			>;
			jsonQuery<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): SseBuilder<
				TPath,
				WithRequest<TRequest, "query", JsonQuery<TSchema>>,
				TMetadata,
				TOpenApi,
				TUsed | "query",
				TResponse
			>;
		}) &
	("pathParams" extends TUsed
		? EmptyObject
		: {
				pathParams<const TSchema extends StandardSchemaV1>(
					schema: TSchema,
				): SseBuilder<
					TPath,
					WithRequest<TRequest, "pathParams", TSchema>,
					TMetadata,
					TOpenApi,
					TUsed | "pathParams",
					TResponse
				>;
			}) &
	("requestKeys" extends TUsed
		? EmptyObject
		: {
				requestKeys<const TKeys extends RequestKeys>(
					keys: TKeys,
				): SseBuilder<
					TPath,
					WithRequest<TRequest, "keys", TKeys>,
					TMetadata,
					TOpenApi,
					TUsed | "requestKeys",
					TResponse
				>;
			}) &
	("flattenRequestKeys" extends TUsed
		? EmptyObject
		: {
				flattenRequestKeys<const TFlatten extends boolean>(
					value: TFlatten,
				): SseBuilder<
					TPath,
					WithRequest<TRequest, "flattenKeys", TFlatten>,
					TMetadata,
					TOpenApi,
					TUsed | "flattenRequestKeys",
					TResponse
				>;
			}) &
	("metadata" extends TUsed
		? { metadata: TMetadata }
		: {
				metadata: TMetadata &
					RouteMetadata &
					(<const TLocal extends RouteMetadata>(
						metadata: TLocal,
					) => SseBuilder<
						TPath,
						TRequest,
						Merge<TMetadata, TLocal>,
						TOpenApi,
						TUsed | "metadata",
						TResponse
					>);
			}) &
	("openApi" extends TUsed
		? { openApi: TOpenApi }
		: {
				openApi: TOpenApi &
					OpenApiRouteOptions &
					(<const TLocal extends OpenApiRouteOptions>(
						openApi: TLocal,
					) => SseBuilder<
						TPath,
						TRequest,
						TMetadata,
						Merge<TOpenApi, TLocal>,
						TUsed | "openApi",
						TResponse
					>);
			});

export type SseBuilder<
	TPath extends string,
	TRequest,
	TMetadata,
	TOpenApi,
	TUsed extends string = never,
	TResponse = never,
> = Simplify<
	{
		readonly method: "GET";
		readonly path: TPath;
		readonly mode: "sse";
	} & (keyof TRequest extends never
		? { request?: never }
		: { request: TRequest }) &
		([TResponse] extends [never]
			? {
					response<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): SseBuilder<TPath, TRequest, TMetadata, TOpenApi, TUsed, TSchema>;
				}
			: { response: TResponse }) &
		SseRequestSetters<TPath, TRequest, TMetadata, TOpenApi, TUsed, TResponse>
>;

export type SseBuilderFor<TOptions, TPath extends string> = SseBuilder<
	PathFor<TOptions, TPath>,
	ProtocolRequestFor<TOptions>,
	OptionValue<TOptions, "metadata", EmptyObject>,
	OptionValue<TOptions, "openApi", EmptyObject>
>;

export const createSseRoute = (path: string, options?: RouteFactoryOptions) =>
	new SseRouteBuilder(path, options);
