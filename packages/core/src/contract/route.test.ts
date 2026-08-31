import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type } from "../standard-schema/index.ts";
import { noBody } from "./body.ts";
import { assertProtocolRouteComplete, route } from "./route.ts";

describe("HTTP route builder runtime", () => {
	it("constructs every HTTP method and keeps methods non-enumerable", () => {
		for (const [factory, method] of [
			[route.get, "GET"],
			[route.post, "POST"],
			[route.put, "PUT"],
			[route.patch, "PATCH"],
			[route.delete, "DELETE"],
		] as const) {
			const declaration = factory("/items");
			assert.equal(declaration.method, method);
			assert.equal(declaration.path, "/items");
			assert.deepEqual(Object.keys(declaration), ["method", "path", "request"]);
			assert.equal(Object.hasOwn(declaration, "body"), false);
		}
	});

	it("supports independent setters in arbitrary order", () => {
		const schema = type<{ value: string }>();
		const declaration = route
			.post("/items/:id")
			.response(201, schema)
			.headers({ authorization: type<string>() })
			.body(schema)
			.query(type<{ search: string }>())
			.pathParams(type<{ id: string }>())
			.requestKeys({ value: "body", search: "query", id: "pathParams" })
			.flattenRequestKeys(false)
			.metadata({ scope: "write" })
			.openApi({ tags: ["Items"] });
		assert.equal(declaration.request?.body, schema);
		assert.equal(declaration.responses?.[201], schema);
		assert.equal(declaration.request?.flattenKeys, false);
	});

	it("applies isolated defaults with local values winning", () => {
		const unauthorized = type<{ message: string }>();
		const defaults = {
			pathPrefix: "/api",
			headers: { authorization: type<string>() },
			responses: { 401: unauthorized },
			metadata: { auth: true, nested: { role: "user" } },
			openApi: { tags: ["Common"], responses: { 401: { description: "No" } } },
			flattenRequestKeys: true,
		} as const;
		const factory = route.with(defaults);
		const first = factory
			.get("/items")
			.headers({ authorization: type<"override">(), trace: type<string>() })
			.response(200, type<string>())
			.customResponse(401, {
				contentType: "application/problem+json",
				schema: type<{ message: string }>(),
			})
			.metadata({ auth: false })
			.openApi({
				tags: ["Items"],
				responses: { 401: { description: "Local" } },
			});
		const second = factory.get("/other");
		assert.equal(first.path, "/api/items");
		assert.equal(
			first.request?.headers?.authorization["~standard"].vendor,
			"rest-rpc",
		);
		assert.deepEqual(Object.keys(first.responses ?? {}), ["200", "401"]);
		assert.equal((first.responses[401] as { kind: string }).kind, "customBody");
		assert.deepEqual(first.metadata, { auth: false, nested: { role: "user" } });
		assert.deepEqual(first.openApi?.tags, ["Common", "Items"]);
		assert.equal(first.openApi?.responses?.[401]?.description, "Local");
		(first.metadata.nested as { role: string }).role = "admin";
		assert.deepEqual({ ...second.metadata }, defaults.metadata);
	});

	it("rejects duplicate and conflicting response declarations", () => {
		const schema = type<string>();
		assert.throws(
			() => route.get("/items").body(schema).body(schema),
			/more than once/,
		);
		assert.throws(
			() => route.get("/items").response(200, schema).response(200, schema),
			/already declares/,
		);
		const response = route.get("/items").response(200, schema);
		assert.throws(
			() =>
				(
					response as unknown as {
						customResponse(
							status: number,
							input: { contentType: string; schema: typeof schema },
						): unknown;
					}
				).customResponse(200, { contentType: "text/plain", schema }),
			/already declares/,
		);
		assert.deepEqual(
			route.delete("/items").response(204).responses?.[204],
			noBody(),
		);
	});

	it("builds specialized request and response declarations", () => {
		const formSchema = type<{ title: string; tags: string[] }>();
		const bytes = type<Uint8Array>();
		const form = route
			.post("/forms")
			.formBody({ schema: formSchema, arrayKeys: ["tags"] })
			.customResponse(201, { contentType: "text/csv", schema: type<string>() });
		assert.deepEqual(form.request?.body, {
			kind: "formBody",
			schema: formSchema,
			arrayKeys: ["tags"],
		});
		assert.equal((form.responses[201] as { kind: string }).kind, "customBody");

		const streamed = route.get("/files").customStreamResponse(200, {
			contentType: "application/octet-stream",
			schema: bytes,
		});
		assert.equal((streamed.responses[200] as { kind: string }).kind, "stream");

		const multipart = route
			.post("/uploads")
			.multipartBody(formSchema)
			.streamResponse(201, type<{ progress: number }>());
		assert.equal(
			(multipart.request!.body as { kind: string }).kind,
			"multipartBody",
		);
		assert.equal((multipart.responses[201] as { kind: string }).kind, "stream");

		const custom = route
			.post("/raw")
			.customBody(bytes)
			.jsonQuery(type<{ options: string[] }>())
			.response(204);
		assert.equal((custom.request!.body as { kind: string }).kind, "customBody");
		assert.equal((custom.request!.query as { kind: string }).kind, "jsonQuery");
	});

	it("shares typestate slots across specialized request setters", () => {
		const schema = type<{ value: string }>();
		assert.throws(
			() =>
				(
					route.post("/items").formBody(schema) as unknown as {
						customBody(schema: typeof schema): unknown;
					}
				).customBody(schema),
			/more than once/,
		);
		assert.throws(
			() =>
				(
					route.get("/items").query(schema) as unknown as {
						jsonQuery(schema: typeof schema): unknown;
					}
				).jsonQuery(schema),
			/more than once/,
		);
	});

	it("does not expose with() on configured factories", () => {
		assert.equal("with" in route.with({ pathPrefix: "/api" }), false);
		assert.throws(
			() => route.with({ pathPrefix: "/:tenant" }),
			/cannot include path params/,
		);
		assert.equal(
			route.with({ pathPrefix: "/api/" }).get("/items").path,
			"/api//items",
		);
	});
});

describe("protocol route builder runtime", () => {
	it("builds complete SSE routes with only compatible setters", () => {
		const event = type<{ id: string }>();
		const declaration = route
			.sse("/events/:id")
			.query(type<{ cursor: string }>())
			.pathParams(type<{ id: string }>())
			.response(event);
		assert.equal(declaration.mode, "sse");
		assert.equal(declaration.response, event);
		assert.equal("body" in declaration, false);
		assert.equal("headers" in declaration, false);
		assert.equal(assertProtocolRouteComplete(declaration), declaration);
	});

	it("builds WebSocket routes from both message directions", () => {
		const client = type<{ command: string }>();
		const server = type<{ event: string }>();
		const directional = route
			.ws("/socket")
			.serverMessages(server)
			.clientMessages(client);
		assert.deepEqual(directional.messages, { client, server });
		assert.equal(assertProtocolRouteComplete(directional), directional);
	});

	it("rejects incomplete and conflicting protocol routes", () => {
		const schema = type<string>();
		assert.throws(
			() => assertProtocolRouteComplete(route.sse("/events")),
			/missing a response schema/,
		);
		assert.throws(
			() =>
				assertProtocolRouteComplete(route.ws("/socket").clientMessages(schema)),
			/client and server messages/,
		);
		assert.throws(() =>
			route.ws("/socket").clientMessages(schema).clientMessages(schema),
		);
	});

	it("ignores HTTP-only configured defaults for protocols", () => {
		const schema = type<string>();
		const factory = route.with({
			pathPrefix: "/api",
			headers: { authorization: schema },
			responses: { 401: schema },
			metadata: { public: true },
		});
		const sse = factory.sse("/events").response(schema);
		const ws = factory
			.ws("/socket")
			.clientMessages(schema)
			.serverMessages(schema);
		assert.equal(sse.path, "/api/events");
		assert.equal(ws.path, "/api/socket");
		assert.equal(sse.request?.headers, undefined);
		assert.equal(Object.hasOwn(sse, "responses"), false);
		assert.deepEqual({ ...sse.metadata }, { public: true });
	});
});
