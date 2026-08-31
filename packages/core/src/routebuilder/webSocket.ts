import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	OpenApiRouteOptions,
	RouteFactoryOptions,
	RouteMetadata,
} from "../contract/contract.ts";
import type { JsonQuery, RequestKeys } from "../contract/request.ts";
import type { WebSocketMessageDeclaration } from "../contract/websocketMessages.ts";
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

class WebSocketRouteBuilder extends BaseRouteBuilder {
	declare messages?: Partial<
		Record<"client" | "server", WebSocketMessageDeclaration>
	>;

	constructor(path: string, options?: RouteFactoryOptions) {
		super(
			"GET",
			path,
			options ?? {},
			protocolRequestDefaults(options ?? {}),
			"webSocket",
		);
	}

	private setMessage(
		direction: "client" | "server",
		schema: WebSocketMessageDeclaration,
	) {
		this.messages = {
			...this.messages,
			[direction]: schema,
		};
		return this;
	}

	clientMessages(schema: WebSocketMessageDeclaration) {
		return this.setMessage("client", schema);
	}

	serverMessages(schema: WebSocketMessageDeclaration) {
		return this.setMessage("server", schema);
	}
}

export type WebSocketCompletion = {
	client?: WebSocketMessageDeclaration;
	server?: WebSocketMessageDeclaration;
};

type WebSocketRequestSetters<
	TPath extends string,
	TRequest,
	TMetadata,
	TOpenApi,
	TUsed extends string,
	TMessages extends WebSocketCompletion,
> = ("query" extends TUsed
	? EmptyObject
	: {
			query<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): WebSocketBuilder<
				TPath,
				WithRequest<TRequest, "query", TSchema>,
				TMetadata,
				TOpenApi,
				TUsed | "query",
				TMessages
			>;
			jsonQuery<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): WebSocketBuilder<
				TPath,
				WithRequest<TRequest, "query", JsonQuery<TSchema>>,
				TMetadata,
				TOpenApi,
				TUsed | "query",
				TMessages
			>;
		}) &
	("pathParams" extends TUsed
		? EmptyObject
		: {
				pathParams<const TSchema extends StandardSchemaV1>(
					schema: TSchema,
				): WebSocketBuilder<
					TPath,
					WithRequest<TRequest, "pathParams", TSchema>,
					TMetadata,
					TOpenApi,
					TUsed | "pathParams",
					TMessages
				>;
			}) &
	("requestKeys" extends TUsed
		? EmptyObject
		: {
				requestKeys<const TKeys extends RequestKeys>(
					keys: TKeys,
				): WebSocketBuilder<
					TPath,
					WithRequest<TRequest, "keys", TKeys>,
					TMetadata,
					TOpenApi,
					TUsed | "requestKeys",
					TMessages
				>;
			}) &
	("flattenRequestKeys" extends TUsed
		? EmptyObject
		: {
				flattenRequestKeys<const TFlatten extends boolean>(
					value: TFlatten,
				): WebSocketBuilder<
					TPath,
					WithRequest<TRequest, "flattenKeys", TFlatten>,
					TMetadata,
					TOpenApi,
					TUsed | "flattenRequestKeys",
					TMessages
				>;
			}) &
	("metadata" extends TUsed
		? { metadata: TMetadata }
		: {
				metadata: TMetadata &
					RouteMetadata &
					(<const TLocal extends RouteMetadata>(
						metadata: TLocal,
					) => WebSocketBuilder<
						TPath,
						TRequest,
						Merge<TMetadata, TLocal>,
						TOpenApi,
						TUsed | "metadata",
						TMessages
					>);
			}) &
	("openApi" extends TUsed
		? { openApi: TOpenApi }
		: {
				openApi: TOpenApi &
					OpenApiRouteOptions &
					(<const TLocal extends OpenApiRouteOptions>(
						openApi: TLocal,
					) => WebSocketBuilder<
						TPath,
						TRequest,
						TMetadata,
						Merge<TOpenApi, TLocal>,
						TUsed | "openApi",
						TMessages
					>);
			});

export type WebSocketBuilder<
	TPath extends string,
	TRequest,
	TMetadata,
	TOpenApi,
	TUsed extends string = never,
	TMessages extends WebSocketCompletion = EmptyObject,
> = Simplify<
	{
		readonly method: "GET";
		readonly path: TPath;
		readonly mode: "webSocket";
	} & (keyof TRequest extends never
		? { request?: never }
		: { request: TRequest }) &
		(keyof TMessages extends never
			? { messages?: never }
			: { messages: TMessages }) &
		(TMessages extends { client: WebSocketMessageDeclaration }
			? EmptyObject
			: {
					clientMessages<const TSchema extends WebSocketMessageDeclaration>(
						schema: TSchema,
					): WebSocketBuilder<
						TPath,
						TRequest,
						TMetadata,
						TOpenApi,
						TUsed,
						Merge<TMessages, { client: TSchema }>
					>;
				}) &
		(TMessages extends { server: WebSocketMessageDeclaration }
			? EmptyObject
			: {
					serverMessages<const TSchema extends WebSocketMessageDeclaration>(
						schema: TSchema,
					): WebSocketBuilder<
						TPath,
						TRequest,
						TMetadata,
						TOpenApi,
						TUsed,
						Merge<TMessages, { server: TSchema }>
					>;
				}) &
		WebSocketRequestSetters<
			TPath,
			TRequest,
			TMetadata,
			TOpenApi,
			TUsed,
			TMessages
		>
>;

export type WebSocketBuilderFor<
	TOptions,
	TPath extends string,
> = WebSocketBuilder<
	PathFor<TOptions, TPath>,
	ProtocolRequestFor<TOptions>,
	OptionValue<TOptions, "metadata", EmptyObject>,
	OptionValue<TOptions, "openApi", EmptyObject>
>;

export const createWebSocketRoute = (
	path: string,
	options?: RouteFactoryOptions,
) => new WebSocketRouteBuilder(path, options);
