import {
	type Contract,
	type HttpRouteDeclaration,
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

const todo = schemaType<{ id: string; title: string }>();
const input = schemaType<{ title: string }>();
const unauthorized = schemaType<{ message: string }>();
const event = schemaType<{ id: string }>();
const clientMessage = schemaType<{ command: string }>();
const serverMessage = schemaType<{ event: string }>();

const apiRoute = route.with({
	pathPrefix: "/api",
	headers: { authorization: schemaType<string>() },
	responses: { 401: unauthorized },
	metadata: { auth: true as const },
	openApi: { tags: ["API"] },
	flattenRequestKeys: true,
});

// HTTP routes build ordinary request/response route declarations.
const create = apiRoute
	.post("/todos")
	.body(input)
	.headers({ trace: schemaType<string>() })
	.params(schemaType<{ accountId: string }>())
	.requestKeys({ title: "body", accountId: "params" })
	.withMetadata({ permission: "todos:create" as const })
	.withOpenApi({ summary: "Create todo" })
	.response(201, todo);

expectType<"POST">(create.method);
expectType<string>(create.path);
expectType<unknown>(create.metadata.auth);
expectType<unknown>(create.metadata.permission);
expectType<typeof input>(create.request.body);
expectType<typeof todo>(create.responses[201]);
expectType<typeof unauthorized>(create.responses[401]);
expectAssignable<HttpRouteDeclaration>(create);
expectAssignable<Contract>(create);

const importRoute = route
	.post("/imports")
	.formBody({ schema: input, arrayKeys: ["title"] })
	.customResponse(201, { contentType: "text/csv", schema: todo });

expectType<"formBody">(importRoute.request.body.kind);
expectType<"customBody">(importRoute.responses[201].kind);

const search = route.get("/search").jsonQuery(input).streamResponse(200, todo);
expectType<"jsonQuery">(search.request.query.kind);
expectType<"stream">(search.responses[200].kind);

expectAssignable<HttpRouteDeclaration>(route.get("/health").response(204));
expectAssignable<HttpRouteDeclaration>(
	route.get("/health").response(204, undefined),
);

// Duplicate response status codes are allowed, but will throw at runtime.
// this is a tradeoff where guarding this at type level is significantly more
// expensive for tsc, and the rare case where someone accidentally creates a
// duplicate response status code does not justify increased compile time for all other cases.
const duplicateResponseStatus = route
	.get("/health")
	.response(200, todo)
	.response(200, event);

expectAssignable<HttpRouteDeclaration>(duplicateResponseStatus);

const mixedResponses = route
	.get("/responses")
	.response(200, todo)
	.customResponse(201, { contentType: "text/csv", schema: input })
	.streamResponse(202, event)
	.customStreamResponse(203, {
		contentType: "application/octet-stream",
		schema: unauthorized,
	});

expectType<typeof todo>(mixedResponses.responses[200]);
expectType<"customBody">(mixedResponses.responses[201].kind);
expectType<typeof input>(mixedResponses.responses[201].schema);
expectType<"stream">(mixedResponses.responses[202].kind);
expectType<typeof event>(mixedResponses.responses[202].schema);
expectType<"stream">(mixedResponses.responses[203].kind);
expectType<"customBody">(mixedResponses.responses[203].schema.kind);
expectType<typeof unauthorized>(mixedResponses.responses[203].schema.schema);
expectAssignable<HttpRouteDeclaration>(mixedResponses);

const responseOnly = route.get("/response-only").customResponse(200, {
	contentType: "text/plain",
	schema: todo,
});

expectError(responseOnly.body(input));
expectError(responseOnly.query(input));
expectError(responseOnly.jsonQuery(input));
expectError(responseOnly.params(input));
expectError(responseOnly.headers({ authorization: input }));
expectError(responseOnly.requestKeys({ id: "params" }));
expectError(responseOnly.withMetadata({ auth: true }));
expectError(responseOnly.withOpenApi({ summary: "Response only" }));

expectError(route.get("/health").response(todo));
expectError(apiRoute.post("/todos").responses({ 201: todo }));

// SSE routes build GET event-stream declarations with request metadata and one event schema.
const incompleteSse = route.sse("/events");
expectNotAssignable<SseRouteDeclaration>(incompleteSse);
expectNotAssignable<Contract>(incompleteSse);
expectError(incompleteSse.body(event));
expectError(incompleteSse.headers({ authorization: schemaType<string>() }));

const sse = incompleteSse
	.query(schemaType<{ cursor: string }>())
	.response(event)
	.withMetadata({ public: true as const });

expectType<"GET">(sse.method);
expectType<"sse">(sse.mode);
expectType<typeof event>(sse.responses[200]);
expectType<unknown>(sse.metadata.public);
expectAssignable<SseRouteDeclaration>(sse);
expectAssignable<Contract>(sse);

// WebSocket routes build GET socket declarations after both message directions are declared.
const incompleteSocket = route.ws("/socket").clientMessages(clientMessage);
expectNotAssignable<WebSocketRouteDeclaration>(incompleteSocket);
expectNotAssignable<Contract>(incompleteSocket);
expectError(incompleteSocket.body(event));
expectError(incompleteSocket.headers({ authorization: schemaType<string>() }));
expectError(incompleteSocket.response(event));
expectError(incompleteSocket.responses({ 200: event }));

const socket = incompleteSocket
	.params(schemaType<{ roomId: string }>())
	.serverMessages(serverMessage)
	.withOpenApi({ summary: "Join socket" });

expectType<"GET">(socket.method);
expectType<"webSocket">(socket.mode);
expectType<typeof clientMessage>(socket.messages.client);
expectType<typeof serverMessage>(socket.messages.server);
expectType<string | undefined>(socket.openApi.summary);
expectAssignable<WebSocketRouteDeclaration>(socket);
expectAssignable<Contract>(socket);
