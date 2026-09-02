import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { OpenApiRouteOptions, RouteMetadata } from "./contract.ts";
import type { RouteFactoryOptions } from "./routeBuilder.ts";
import type { JsonQuery, RequestKeys } from "./request.ts";
import type { RequestParamsSchema, RequestQuerySchema } from "./request.ts";
import {
	BaseRouteBuilder,
	type BuilderState,
	type ProtocolRequestFor,
	protocolRequestDefaults,
	type UseBuilderMethod,
	type WhenUnused,
	type WithRequest,
} from "./baseRouteBuilder.ts";

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

type SseBuilderMethod =
	| "query"
	| "params"
	| "requestKeys"
	| "withMetadata"
	| "withOpenApi";

type SseBuilderState = BuilderState<unknown, SseBuilderMethod> & {
	response: unknown;
};

type SetSseRequest<
	TState extends SseBuilderState,
	TKey extends "query" | "params" | "keys",
	TValue,
	TMethod extends SseBuilderMethod,
> = UseBuilderMethod<WithRequest<TState, TKey, TValue>, TMethod>;

type SseBuilderDeclaration<TState extends SseBuilderState> = {
	readonly method: "GET";
	readonly path: string;
	readonly mode: "sse";
} & (keyof TState["request"] extends never
	? { request?: never }
	: { request: TState["request"] });

/** A completed SSE route declaration with its inferred request and response. */
export type FinalizedSseRoute<TRequest, TResponse, TUsed> = {
	readonly method: "GET";
	readonly path: string;
	readonly mode: "sse";
} & (keyof TRequest extends never
	? { request?: never }
	: { request: TRequest }) & {
		responses: { 200: TResponse };
	} & ("withMetadata" extends TUsed
		? { metadata: RouteMetadata }
		: Record<never, never>) &
	("withOpenApi" extends TUsed
		? { openApi: OpenApiRouteOptions }
		: Record<never, never>);

type SseResponseSetter<TState extends SseBuilderState> = [
	TState["response"],
] extends [never]
	? {
			response<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): SseBuilder<Omit<TState, "response"> & { response: TSchema }>;
		}
	: {
			responses: { 200: TState["response"] };
			finalize(): FinalizedSseRoute<
				{ [TKey in keyof TState["request"]]: TState["request"][TKey] },
				TState["response"],
				TState["used"]
			>;
		};

type SseRequestSetters<TState extends SseBuilderState> = WhenUnused<
	TState,
	"query",
	{
		query<const TSchema extends RequestQuerySchema>(
			schema: TSchema,
		): SseBuilder<SetSseRequest<TState, "query", TSchema, "query">>;
		jsonQuery<const TSchema extends StandardSchemaV1>(
			schema: TSchema,
		): SseBuilder<SetSseRequest<TState, "query", JsonQuery<TSchema>, "query">>;
	}
> &
	WhenUnused<
		TState,
		"params",
		{
			params<const TSchema extends RequestParamsSchema>(
				schema: TSchema,
			): SseBuilder<SetSseRequest<TState, "params", TSchema, "params">>;
		}
	> &
	WhenUnused<
		TState,
		"requestKeys",
		{
			requestKeys<const TKeys extends RequestKeys>(
				keys: TKeys,
			): SseBuilder<SetSseRequest<TState, "keys", TKeys, "requestKeys">>;
		}
	> &
	("withMetadata" extends TState["used"]
		? { metadata: RouteMetadata }
		: {
				withMetadata(
					metadata: RouteMetadata,
				): SseBuilder<UseBuilderMethod<TState, "withMetadata">>;
			}) &
	("withOpenApi" extends TState["used"]
		? { openApi: OpenApiRouteOptions }
		: {
				withOpenApi(
					openApi: OpenApiRouteOptions,
				): SseBuilder<UseBuilderMethod<TState, "withOpenApi">>;
			});

export type SseBuilder<TState extends SseBuilderState> =
	SseBuilderDeclaration<TState> &
		SseResponseSetter<TState> &
		SseRequestSetters<TState>;

export type SseBuilderFor<TOptions> = SseBuilder<{
	request: ProtocolRequestFor<TOptions>;
	used: never;
	response: never;
}>;

export const createSseRoute = (path: string, options?: RouteFactoryOptions) =>
	new SseRouteBuilder(path, options);
