import {
	type Contract,
	route,
	type SseRouteDeclaration,
	type as schemaType,
	type WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import {
	expectAssignable,
	expectError,
	expectNotAssignable,
	expectType,
} from "tsd";

const event = schemaType<{ id: string }>();
const clientMessage = schemaType<{ command: string }>();
const serverMessage = schemaType<{ event: string }>();

const incompleteSse = route.sse("/events");
expectNotAssignable<SseRouteDeclaration>(incompleteSse);
expectNotAssignable<Contract>(incompleteSse);
expectError(incompleteSse.body(event));
expectError(incompleteSse.headers({ authorization: schemaType<string>() }));

const sse = incompleteSse
	.openApi({ summary: "Events" })
	.query({ cursor: schemaType<string>() })
	.response(event);
expectAssignable<SseRouteDeclaration>(sse);
expectAssignable<Contract>(sse);
expectType<"sse">(sse.mode);
expectType<typeof event>(sse.response);
expectError(sse.response(event));

const incompleteSocket = route.ws("/socket").clientMessages(clientMessage);
expectNotAssignable<WebSocketRouteDeclaration>(incompleteSocket);
expectNotAssignable<Contract>(incompleteSocket);
expectError(incompleteSocket.body(event));
expectError(incompleteSocket.headers({ authorization: schemaType<string>() }));
expectError(incompleteSocket.response(event));
expectError(incompleteSocket.responses({ 200: event }));

const socket = incompleteSocket.serverMessages(serverMessage);
expectAssignable<WebSocketRouteDeclaration>(socket);
expectAssignable<Contract>(socket);
expectType<typeof clientMessage>(socket.messages.client);
expectType<typeof serverMessage>(socket.messages.server);
expectError(socket.clientMessages(clientMessage));
expectError(socket.serverMessages(serverMessage));

export type SseRouteHover = typeof sse;
export type WebSocketRouteHover = typeof socket;
