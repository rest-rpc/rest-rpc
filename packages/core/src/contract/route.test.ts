import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type } from "../standard-schema/index.ts";
import { noBody } from "./body.ts";
import { route } from "./route.ts";

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
			.query({ search: type<string>() })
			.pathParams({ id: type<string>() })
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
			.metadata({ auth: false })
			.openApi({ tags: ["Items"], responses: { 401: { description: "Local" } } });
		const second = factory.get("/other");
		assert.equal(first.path, "/api/items");
		assert.equal(first.request?.headers?.authorization["~standard"].vendor, "rest-rpc");
		assert.deepEqual(Object.keys(first.responses ?? {}), ["200", "401"]);
		assert.deepEqual(first.metadata, { auth: false, nested: { role: "user" } });
		assert.deepEqual(first.openApi?.tags, ["Common", "Items"]);
		assert.equal(first.openApi?.responses?.[401]?.description, "Local");
		(first.metadata.nested as { role: string }).role = "admin";
		assert.deepEqual({ ...second.metadata }, defaults.metadata);
	});

	it("rejects duplicate and conflicting response declarations", () => {
		const schema = type<string>();
		assert.throws(() => route.get("/items").body(schema).body(schema), /more than once/);
		assert.throws(() => route.get("/items").response(200, schema).response(200, schema), /already declares/);
		assert.deepEqual(route.delete("/items").response(204).responses?.[204], noBody());
	});

	it("does not expose with() on configured factories", () => {
		assert.equal("with" in route.with({ pathPrefix: "/api" }), false);
		assert.throws(() => route.with({ pathPrefix: "/:tenant" }), /cannot include path params/);
		assert.equal(route.with({ pathPrefix: "/api/" }).get("/items").path, "/api//items");
	});
});
