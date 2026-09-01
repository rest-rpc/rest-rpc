import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	OpenApiRouteOptions,
	RouteFactoryOptions,
	RouteMetadata,
} from "../contract/contract.ts";
import type { JsonQuery, RequestKeys } from "../contract/request.ts";
import { BaseRouteBuilder } from "./baseRouteBuilder.ts";
import type { EmptyObject, ProtocolRequestFor, WithRequest } from "./shared.ts";
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
	TUsed extends string,
	TResponse,
> = ("query" extends TUsed
	? EmptyObject
	: {
			query<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): SseBuilder<
				WithRequest<TRequest, "query", TSchema>,
				TUsed | "query",
				TResponse
			>;
			jsonQuery<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): SseBuilder<
				WithRequest<TRequest, "query", JsonQuery<TSchema>>,
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
					TUsed | "requestKeys",
					TResponse
				>;
			}) &
	("withMetadata" extends TUsed
		? { metadata: RouteMetadata }
		: {
				withMetadata(
					metadata: RouteMetadata,
				): SseBuilder<TRequest, TUsed | "withMetadata", TResponse>;
			}) &
	("withOpenApi" extends TUsed
		? { openApi: OpenApiRouteOptions }
		: {
				withOpenApi(
					openApi: OpenApiRouteOptions,
				): SseBuilder<TRequest, TUsed | "withOpenApi", TResponse>;
			});

export type SseBuilder<
	TRequest,
	TUsed extends string = never,
	TResponse = never,
> = {
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
				): SseBuilder<TRequest, TUsed, TSchema>;
			}
		: { responses: { 200: TResponse } }) &
	SseRequestSetters<TRequest, TUsed, TResponse>;

export type SseBuilderFor<TOptions> = SseBuilder<ProtocolRequestFor<TOptions>>;

export const createSseRoute = (path: string, options?: RouteFactoryOptions) =>
	new SseRouteBuilder(path, options);
