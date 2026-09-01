import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	RouteFactoryOptions,
	RouteMetadata,
} from "../contract/contract.ts";
import type { JsonQuery, RequestKeys } from "../contract/request.ts";
import type { WebSocketMessageSchemas } from "../contract/websocketMessages.ts";
import {
	BaseRouteBuilder,
	type EmptyObject,
	type ProtocolRequestFor,
	protocolRequestDefaults,
	type WithRequest,
} from "./baseRouteBuilder.ts";

class WebSocketRouteBuilder extends BaseRouteBuilder {
	declare messages?: Partial<
		Record<"client" | "server", WebSocketMessageSchemas>
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
		type: string,
		schema: StandardSchemaV1,
	) {
		const current = this.messages?.[direction];
		if (current?.[type]) {
			throw new Error(
				`WebSocket ${direction} message type "${type}" is already declared.`,
			);
		}
		this.messages = {
			...this.messages,
			[direction]: {
				...current,
				[type]: schema,
			},
		};
		return this;
	}

	clientMessage(type: string, schema: StandardSchemaV1) {
		return this.setMessage("client", type, schema);
	}

	serverMessage(type: string, schema: StandardSchemaV1) {
		return this.setMessage("server", type, schema);
	}
}

type AddWebSocketMessage<
	TMessages extends WebSocketCompletion,
	TDirection extends "client" | "server",
	TType extends string,
	TSchema extends StandardSchemaV1,
> = TMessages & {
	[TKey in TDirection]: Record<TType, TSchema>;
};

type WebSocketMessageSetters<
	TRequest,
	TUsed extends string,
	TMessages extends WebSocketCompletion,
> = {
	clientMessage<
		const TType extends string,
		const TSchema extends StandardSchemaV1,
	>(
		type: TType,
		schema: TSchema,
	): WebSocketBuilder<
		TRequest,
		TUsed,
		AddWebSocketMessage<TMessages, "client", TType, TSchema>
	>;
	serverMessage<
		const TType extends string,
		const TSchema extends StandardSchemaV1,
	>(
		type: TType,
		schema: TSchema,
	): WebSocketBuilder<
		TRequest,
		TUsed,
		AddWebSocketMessage<TMessages, "server", TType, TSchema>
	>;
};

export type WebSocketCompletion = {
	client?: WebSocketMessageSchemas;
	server?: WebSocketMessageSchemas;
};

type WebSocketRequestSetters<
	TRequest,
	TUsed extends string,
	TMessages extends WebSocketCompletion,
> = ("query" extends TUsed
	? EmptyObject
	: {
			query<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): WebSocketBuilder<
				WithRequest<TRequest, "query", TSchema>,
				TUsed | "query",
				TMessages
			>;
			jsonQuery<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): WebSocketBuilder<
				WithRequest<TRequest, "query", JsonQuery<TSchema>>,
				TUsed | "query",
				TMessages
			>;
		}) &
	("params" extends TUsed
		? EmptyObject
		: {
				params<const TSchema extends StandardSchemaV1>(
					schema: TSchema,
				): WebSocketBuilder<
					WithRequest<TRequest, "params", TSchema>,
					TUsed | "params",
					TMessages
				>;
			}) &
	("requestKeys" extends TUsed
		? EmptyObject
		: {
				requestKeys<const TKeys extends RequestKeys>(
					keys: TKeys,
				): WebSocketBuilder<
					WithRequest<TRequest, "keys", TKeys>,
					TUsed | "requestKeys",
					TMessages
				>;
			}) &
	("withMetadata" extends TUsed
		? { metadata: RouteMetadata }
		: {
				withMetadata(
					metadata: RouteMetadata,
				): WebSocketBuilder<TRequest, TUsed | "withMetadata", TMessages>;
			});

export type WebSocketBuilder<
	TRequest,
	TUsed extends string = never,
	TMessages extends WebSocketCompletion = EmptyObject,
> = {
	readonly method: "GET";
	readonly path: string;
	readonly mode: "webSocket";
} & (keyof TRequest extends never
	? { request?: never }
	: { request: TRequest }) &
	(keyof TMessages extends never
		? { messages?: never }
		: { messages: TMessages }) &
	WebSocketMessageSetters<TRequest, TUsed, TMessages> &
	WebSocketRequestSetters<TRequest, TUsed, TMessages>;

export type WebSocketBuilderFor<TOptions> = WebSocketBuilder<
	ProtocolRequestFor<TOptions>
>;

export const createWebSocketRoute = (
	path: string,
	options?: RouteFactoryOptions,
) => new WebSocketRouteBuilder(path, options);
