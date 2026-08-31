import {
	type HttpRouteDeclaration,
	route,
	type as schemaType,
} from "@rest-rpc/core/contract";
import { expectAssignable, expectError, expectType } from "tsd";

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
expectType<typeof input>(create.request?.body);
expectType<typeof todo>(create.responses[201]);
expectType<typeof unauthorized>(create.responses[401]);
expectAssignable<HttpRouteDeclaration>(create);
expectAssignable<HttpRouteDeclaration>(route.get("/health").response(204));
expectError(route.get("/health").response(todo));

expectError(create.body(input));
expectError(apiRoute.post("/todos").response(201, todo).response(201, todo));
expectError(apiRoute.post("/todos").responses({ 201: todo }));

const reordered = route
	.post("/todos")
	.openApi({ summary: "Create" })
	.response(201, todo)
	.headers({ authorization: schemaType<string>() })
	.body(input);

expectType<typeof input>(reordered.request?.body);
expectType<typeof todo>(reordered.responses[201]);

// Representative declarations are intentionally named for editor hover fixtures.
export type CreateRouteHover = typeof create;
export type ReorderedRouteHover = typeof reordered;
