import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	OpenApiRouteOptions,
	RouteFactoryOptions,
	RouteMetadata,
} from "../contract/contract.ts";
import type { JsonQuery, RequestKeys } from "../contract/request.ts";
import { BaseRouteBuilder } from "./baseRouteBuilder.ts";
import type {
	EmptyObject,
	Merge,
	OptionValue,
	ProtocolRequestFor,
	Simplify,
	WithRequest,
} from "./shared.ts";
import { protocolRequestDefaults } from "./shared.ts";

class SseRouteBuilder extends BaseRouteBuilder {
	declare responses?: Record<200, StandardSchemaV1>;

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
		this.responses = { 200: schema };
		return this;
	}
}

type SseRequestSetters<
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
				WithRequest<TRequest, "query", TSchema>,
				TMetadata,
				TOpenApi,
				TUsed | "query",
				TResponse
			>;
			jsonQuery<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): SseBuilder<
				WithRequest<TRequest, "query", JsonQuery<TSchema>>,
				TMetadata,
				TOpenApi,
				TUsed | "query",
				TResponse
			>;
		}) &
	("params" extends TUsed
		? EmptyObject
		: {
				params<const TSchema extends StandardSchemaV1>(
					schema: TSchema,
				): SseBuilder<
					WithRequest<TRequest, "params", TSchema>,
					TMetadata,
					TOpenApi,
					TUsed | "params",
					TResponse
				>;
			}) &
	("requestKeys" extends TUsed
		? EmptyObject
		: {
				requestKeys<const TKeys extends RequestKeys>(
					keys: TKeys,
				): SseBuilder<
					WithRequest<TRequest, "keys", TKeys>,
					TMetadata,
					TOpenApi,
					TUsed | "requestKeys",
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
						TRequest,
						RouteMetadata,
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
						TRequest,
						TMetadata,
						Merge<TOpenApi, TLocal>,
						TUsed | "openApi",
						TResponse
					>);
			});

export type SseBuilder<
	TRequest,
	TMetadata,
	TOpenApi,
	TUsed extends string = never,
	TResponse = never,
> = Simplify<
	{
		readonly method: "GET";
		readonly path: string;
		readonly mode: "sse";
	} & (keyof TRequest extends never
		? { request?: never }
		: { request: TRequest }) &
		([TResponse] extends [never]
			? {
					response<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): SseBuilder<TRequest, TMetadata, TOpenApi, TUsed, TSchema>;
				}
			: { responses: { 200: TResponse } }) &
		SseRequestSetters<TRequest, TMetadata, TOpenApi, TUsed, TResponse>
>;

export type SseBuilderFor<TOptions> = SseBuilder<
	ProtocolRequestFor<TOptions>,
	OptionValue<TOptions, "metadata", EmptyObject>,
	OptionValue<TOptions, "openApi", EmptyObject>
>;

export const createSseRoute = (path: string, options?: RouteFactoryOptions) =>
	new SseRouteBuilder(path, options);
