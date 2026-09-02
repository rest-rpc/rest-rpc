import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { RouteMetadata } from "../contract/contract.ts";
import type { RouteFactoryOptions } from "./index.ts";
import type {
	JsonQuery,
	RequestKeys,
	RequestParamsSchema,
	RequestQuerySchema,
} from "../contract/request.ts";
import type { WebSocketMessageSchemas } from "../contract/websocketMessages.ts";
import {
	BaseRouteBuilder,
	type BuilderState,
	type EmptyObject,
	type ProtocolRequestFor,
	protocolRequestDefaults,
	type UseBuilderMethod,
	type WhenUnused,
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
	TState extends WebSocketBuilderState,
	TDirection extends "client" | "server",
	TType extends string,
	TSchema extends StandardSchemaV1,
> = Omit<TState, "messages"> & {
	messages: TState["messages"] & {
		[TKey in TDirection]: Record<TType, TSchema>;
	};
};

type WebSocketBuilderMethod =
	| "query"
	| "params"
	| "requestKeys"
	| "withMetadata";

type WebSocketBuilderState = BuilderState<unknown, WebSocketBuilderMethod> & {
	messages: WebSocketCompletion;
};

type SetWebSocketRequest<
	TState extends WebSocketBuilderState,
	TKey extends "query" | "params" | "keys",
	TValue,
	TMethod extends WebSocketBuilderMethod,
> = UseBuilderMethod<WithRequest<TState, TKey, TValue>, TMethod>;

type WebSocketBuilderDeclaration<TState extends WebSocketBuilderState> = {
	readonly method: "GET";
	readonly path: string;
	readonly mode: "webSocket";
} & (keyof TState["request"] extends never
	? { request?: never }
	: { request: TState["request"] }) &
	(keyof TState["messages"] extends never
		? { messages?: never }
		: { messages: TState["messages"] });

/** A completed WebSocket route declaration with its inferred request and messages. */
export type FinalizedWebSocketRoute<TRequest, TMessages, TUsed> = {
	readonly method: "GET";
	readonly path: string;
	readonly mode: "webSocket";
} & (keyof TRequest extends never
	? { request?: never }
	: { request: TRequest }) & {
		messages: TMessages;
	} & ("withMetadata" extends TUsed
		? { metadata: RouteMetadata }
		: Record<never, never>);

type WebSocketFinalize<TState extends WebSocketBuilderState> =
	keyof TState["messages"] extends never
		? EmptyObject
		: {
				finalize(): FinalizedWebSocketRoute<
					{ [TKey in keyof TState["request"]]: TState["request"][TKey] },
					{ [TKey in keyof TState["messages"]]: TState["messages"][TKey] },
					TState["used"]
				>;
			};

type WebSocketMessageSetters<TState extends WebSocketBuilderState> = {
	clientMessage<
		const TType extends string,
		const TSchema extends StandardSchemaV1,
	>(
		type: TType,
		schema: TSchema,
	): WebSocketBuilder<AddWebSocketMessage<TState, "client", TType, TSchema>>;
	serverMessage<
		const TType extends string,
		const TSchema extends StandardSchemaV1,
	>(
		type: TType,
		schema: TSchema,
	): WebSocketBuilder<AddWebSocketMessage<TState, "server", TType, TSchema>>;
};

export type WebSocketCompletion = {
	client?: WebSocketMessageSchemas;
	server?: WebSocketMessageSchemas;
};

type WebSocketRequestSetters<TState extends WebSocketBuilderState> = WhenUnused<
	TState,
	"query",
	{
		query<const TSchema extends RequestQuerySchema>(
			schema: TSchema,
		): WebSocketBuilder<SetWebSocketRequest<TState, "query", TSchema, "query">>;
		jsonQuery<const TSchema extends StandardSchemaV1>(
			schema: TSchema,
		): WebSocketBuilder<
			SetWebSocketRequest<TState, "query", JsonQuery<TSchema>, "query">
		>;
	}
> &
	WhenUnused<
		TState,
		"params",
		{
			params<const TSchema extends RequestParamsSchema>(
				schema: TSchema,
			): WebSocketBuilder<
				SetWebSocketRequest<TState, "params", TSchema, "params">
			>;
		}
	> &
	WhenUnused<
		TState,
		"requestKeys",
		{
			requestKeys<const TKeys extends RequestKeys>(
				keys: TKeys,
			): WebSocketBuilder<
				SetWebSocketRequest<TState, "keys", TKeys, "requestKeys">
			>;
		}
	> &
	("withMetadata" extends TState["used"]
		? { metadata: RouteMetadata }
		: {
				withMetadata(
					metadata: RouteMetadata,
				): WebSocketBuilder<UseBuilderMethod<TState, "withMetadata">>;
			});

export type WebSocketBuilder<TState extends WebSocketBuilderState> =
	WebSocketBuilderDeclaration<TState> &
		WebSocketMessageSetters<TState> &
		WebSocketRequestSetters<TState> &
		WebSocketFinalize<TState>;

export type WebSocketBuilderFor<TOptions> = WebSocketBuilder<{
	request: ProtocolRequestFor<TOptions>;
	used: never;
	messages: EmptyObject;
}>;

export const createWebSocketRoute = (
	path: string,
	options?: RouteFactoryOptions,
) => new WebSocketRouteBuilder(path, options);
