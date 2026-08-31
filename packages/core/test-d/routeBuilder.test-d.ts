import {
	type Contract,
	customBody,
	formBody,
	type HttpRouteDeclaration,
	noBody,
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

const apiRoute = route.with({
	pathPrefix: "/api",
	headers: { authorization: schemaType<string>() },
	responses: { 401: unauthorized },
	metadata: { auth: true as const },
	openApi: { tags: ["API"] },
	flattenRequestKeys: true,
});

const create = apiRoute
	.post("/todos")
	.response(201, todo)
	.body(input)
	.metadata({ permission: "todos:create" as const });

expectType<"POST">(create.method);
expectType<"/api/todos">(create.path);
expectType<true>(create.metadata.auth);
expectType<"todos:create">(create.metadata.permission);
expectType<typeof input>(create.request!.body);
expectType<typeof todo>(create.responses[201]);
expectType<typeof unauthorized>(create.responses[401]);
expectAssignable<HttpRouteDeclaration>(create);
expectAssignable<HttpRouteDeclaration>(route.get("/health").response(204));
expectError(route.get("/health").response(todo));
expectError(route.get("/health").response(204, undefined));

expectError(create.body(input));
expectError(apiRoute.post("/todos").response(201, todo).response(201, todo));
expectError(apiRoute.post("/todos").responses({ 201: todo }));
expectError(route.post("/todos").body(formBody(input)));
expectError(route.post("/todos").body(noBody()));
expectError(route.delete("/todos").response(204, noBody()));
expectError(
	route
		.get("/todos")
		.response(200, customBody({ contentType: "text/csv", schema: input })),
);

const specializedRequest = route
	.post("/imports")
	.customBody({ contentType: "text/csv", schema: input })
	.customResponse(201, { contentType: "text/csv", schema: todo });
expectType<"customBody">(specializedRequest.request!.body.kind);
expectType<"customBody">(specializedRequest.responses[201].kind);
expectError(specializedRequest.body(input));
expectError(specializedRequest.formBody(input));
expectError(specializedRequest.multipartBody(input));
expectError(specializedRequest.customBody(input));

const jsonQueryRoute = route
	.get("/search")
	.jsonQuery(input)
	.streamResponse(200, todo);
expectType<"jsonQuery">(jsonQueryRoute.request!.query.kind);
expectType<"stream">(jsonQueryRoute.responses[200].kind);
expectError(jsonQueryRoute.query(input));
expectError(jsonQueryRoute.jsonQuery(input));
expectError(
	jsonQueryRoute.customResponse(200, { contentType: "text/csv", schema: todo }),
);

const reordered = route
	.post("/todos")
	.openApi({ summary: "Create" })
	.response(201, todo)
	.headers({ authorization: schemaType<string>() })
	.body(input);

expectType<typeof input>(reordered.request!.body);
expectType<typeof todo>(reordered.responses[201]);

// Representative declarations are intentionally named for editor hover fixtures.
export type CreateRouteHover = typeof create;
export type ReorderedRouteHover = typeof reordered;

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
	.query(schemaType<{ cursor: string }>())
	.response(event);
expectAssignable<SseRouteDeclaration>(sse);
expectAssignable<Contract>(sse);
expectType<"sse">(sse.mode);
expectType<typeof event>(sse.response);
expectError(sse.response(event));
expectError(sse.jsonQuery(event));

const jsonQuerySse = route
	.sse("/events/search")
	.jsonQuery(event)
	.response(event);
expectType<"jsonQuery">(jsonQuerySse.request!.query.kind);
expectError(jsonQuerySse.query(event));

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
