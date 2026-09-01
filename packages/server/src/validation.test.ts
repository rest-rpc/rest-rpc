import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	customBody,
	formBody,
	jsonQuery,
	multipartBody,
	route,
	stream,
} from "@rest-rpc/core/contract";
import z from "zod";
import {
	resolveCustomResponseBody,
	validateRequest,
	validateResponseBody,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";

describe("validateRequest", () => {
	it("validates inherited and local headers against raw input and merges local output last", async () => {
		const seen: unknown[] = [];
		const inherited = z
			.object({ authorization: z.string(), shared: z.string() })
			.transform((value) => {
				seen.push(value);
				return { inherited: true, shared: "inherited" };
			});
		const local = z
			.object({ shared: z.string(), requestId: z.string() })
			.transform((value) => {
				seen.push(value);
				return { local: true, shared: "local" };
			});
		const declaration = route
			.with({ headers: inherited })
			.get("/headers")
			.headers(local)
			.response(204);

		const result = await validateRequest(declaration, {
			headers: {
				authorization: "Bearer token",
				shared: "raw-shared",
				requestId: "request-1",
			},
		});

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data.headers, {
				inherited: true,
				local: true,
				shared: "local",
			});
		}
		assert.deepEqual(seen, [
			{ authorization: "Bearer token", shared: "raw-shared" },
			{ shared: "raw-shared", requestId: "request-1" },
		]);
	});

	it("rejects a request when either inherited or local header validation fails", async () => {
		const declaration = route
			.with({ headers: z.object({ authorization: z.string() }) })
			.get("/headers")
			.headers(z.object({ requestId: z.string() }))
			.response(204);

		for (const headers of [
			{ requestId: "request-1" },
			{ authorization: "Bearer token" },
		]) {
			const result = await validateRequest(declaration, { headers });
			assert.equal(result.success, false);
		}
	});

	it("parses JSON date strings with request body transforms", async () => {
		const result = await validateRequest(
			{
				method: "POST",
				path: "/todos",
				request: {
					body: z.object({
						createdAt: z.iso.datetime().transform((value) => new Date(value)),
					}),
					keys: {
						createdAt: "body",
					},
				},
				responses: {},
			},
			{
				body: { createdAt: "2026-08-10T00:00:00.000Z" },
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.ok(result.data.body.createdAt instanceof Date);
		}
	});

	it("rejects Date request bodies received as JSON strings", async () => {
		const wireBody = JSON.parse(
			JSON.stringify({ createdAt: new Date("2026-08-10T00:00:00.000Z") }),
		);

		const result = await validateRequest(
			{
				method: "POST",
				path: "/todos",
				request: {
					body: z.object({
						createdAt: z.date(),
					}),
					keys: {
						createdAt: "body",
					},
				},
				responses: {},
			},
			{
				body: wireBody,
			},
		);

		assert.equal(result.success, false);
		if (!result.success) {
			assert.equal(result.response.body.validationErrors.length, 1);
		}
	});

	it("parses string params and query with coercion or transforms", async () => {
		const result = await validateRequest(
			{
				method: "GET",
				path: "/todos/:id",
				request: {
					params: z.object({ id: z.coerce.number() }),
					query: z.object({
						published: z
							.enum(["true", "false"])
							.transform((value) => value === "true"),
					}),
					keys: {
						id: "params",
						published: "query",
					},
				},
				responses: {},
			},
			{
				params: { id: "123" },
				query: { published: "false" },
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, {
				params: { id: 123 },
				query: { published: false },
			});
		}
	});

	it("rejects numeric and boolean params or query without coercion", async () => {
		const result = await validateRequest(
			{
				method: "GET",
				path: "/todos/:id",
				request: {
					params: z.object({ id: z.number() }),
					query: z.object({ published: z.boolean() }),
					keys: {
						id: "params",
						published: "query",
					},
				},
				responses: {},
			},
			{
				params: { id: "123" },
				query: { published: "true" },
			},
		);

		assert.equal(result.success, false);
		if (!result.success) {
			assert.equal(result.response.body.validationErrors.length, 2);
		}
	});

	it("parses JSON query values before schema validation", async () => {
		const result = await validateRequest(
			{
				method: "GET",
				path: "/todos",
				request: {
					query: jsonQuery(
						z.object({
							page: z.number(),
							filters: z.object({ tags: z.array(z.string()) }),
						}),
					),
					keys: {},
				},
				responses: {},
			},
			{
				query: {
					query: JSON.stringify({
						page: 2,
						filters: { tags: ["api", "typescript"] },
					}),
				},
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, {
				query: { page: 2, filters: { tags: ["api", "typescript"] } },
			});
		}
	});

	it("allows omitted optional JSON query values", async () => {
		const result = await validateRequest(
			{
				method: "GET",
				path: "/todos",
				request: {
					query: jsonQuery(z.object({ page: z.number() }).optional()),
					keys: {},
				},
				responses: {},
			},
			{},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, { query: undefined });
		}
	});

	it("wraps custom request bodies with selected content type", async () => {
		const result = await validateRequest(
			{
				method: "POST",
				path: "/images",
				request: {
					body: customBody({
						contentType: ["image/png", "image/jpeg"],
						schema: z.string().transform((value) => value.toUpperCase()),
					}),
					keys: {},
				},
				responses: {},
			},
			{
				body: "jpeg bytes",
				headers: {
					"content-type": "image/jpeg; charset=binary",
				},
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, {
				body: {
					contentType: "image/jpeg",
					payload: "JPEG BYTES",
				},
			});
		}
	});

	it("validates custom request bodies without content type as payloads", async () => {
		const result = await validateRequest(
			{
				method: "POST",
				path: "/forms",
				request: {
					body: customBody(z.instanceof(URLSearchParams)),
					keys: {},
				},
				responses: {},
			},
			{
				body: new URLSearchParams([["title", "Write docs"]]),
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.ok(result.data.body instanceof URLSearchParams);
			assert.equal(result.data.body.get("title"), "Write docs");
		}
	});

	it("validates urlencoded form bodies from URLSearchParams", async () => {
		const result = await validateRequest(
			{
				method: "POST",
				path: "/forms",
				request: {
					body: formBody(
						z.object({
							title: z.string(),
							count: z.coerce.number(),
							remember: z.string().optional(),
						}),
					),
					keys: {},
				},
				responses: {},
			},
			{
				body: new URLSearchParams([
					["title", "Write docs"],
					["count", "3"],
				]),
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, {
				body: {
					title: "Write docs",
					count: 3,
				},
			});
		}
	});

	it("validates inferred urlencoded form array keys from repeated values", async () => {
		const result = await validateRequest(
			{
				method: "POST",
				path: "/forms",
				request: {
					body: formBody(
						z.object({
							title: z.string(),
							tags: z.array(z.string()),
						}),
					),
					keys: {},
				},
				responses: {},
			},
			{
				body: new URLSearchParams([
					["title", "First"],
					["title", "Second"],
					["tags", "ts"],
					["tags", "rpc"],
				]),
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, {
				body: {
					title: "First",
					tags: ["ts", "rpc"],
				},
			});
		}
	});

	it("validates multipart bodies from FormData", async () => {
		const file = new Blob(["hello"], { type: "text/plain" });
		const body = new FormData();
		body.set("title", "Write docs");
		body.set("count", "3");
		body.set("file", file);
		body.append("tags", "ts");
		body.append("tags", "rpc");

		const result = await validateRequest(
			{
				method: "POST",
				path: "/uploads",
				request: {
					body: multipartBody({
						schema: z.object({
							title: z.string(),
							count: z.coerce.number(),
							file: z.instanceof(Blob),
							tags: z.array(z.string()),
						}),
						arrayKeys: ["tags"],
					}),
					keys: {},
				},
				responses: {},
			},
			{
				body,
				headers: {
					"content-type": "multipart/form-data",
				},
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.equal(result.data.body.title, "Write docs");
			assert.equal(result.data.body.count, 3);
			assert.ok(result.data.body.file instanceof Blob);
			assert.deepEqual(result.data.body.tags, ["ts", "rpc"]);
		}
	});

	it("rejects malformed JSON query values as request validation errors", async () => {
		const result = await validateRequest(
			{
				method: "GET",
				path: "/todos",
				request: {
					query: jsonQuery(z.object({ page: z.number() })),
					keys: {},
				},
				responses: {},
			},
			{
				query: { query: "{" },
			},
		);

		assert.equal(result.success, false);
		if (!result.success) {
			assert.deepEqual(result.response.body.validationErrors, [
				{ message: 'Invalid JSON query parameter "query".' },
			]);
		}
	});
});

describe("validateResponseBody", () => {
	it("validates custom response bodies", async () => {
		await assert.rejects(
			validateResponseBody(
				customBody({
					contentType: "text/csv",
					schema: z.number(),
				}),
				"id,title\n1,First\n",
			),
		);
	});
});

describe("validateResponseHeaders", () => {
	it("validates and transforms unconstrained response-header input", async () => {
		const result = await validateResponseHeaders(
			{
				body: z.object({ id: z.string() }),
				headers: z.string().transform((value) => ({ etag: value })),
			},
			"todo-etag",
		);

		assert.deepEqual(result, { etag: "todo-etag" });
	});

	it("normalizes declared response headers", async () => {
		assert.deepEqual(
			await validateResponseHeaders(
				{
					body: z.object({ id: z.string() }),
					headers: z.object({
						etag: z.string(),
						"x-optional": z.string().optional(),
					}),
				},
				{
					etag: "todo-etag",
					"x-optional": undefined,
				},
			),
			{
				etag: "todo-etag",
			},
		);
	});
});

describe("resolveCustomResponseBody", () => {
	it("resolves declared custom response content types", () => {
		assert.deepEqual(
			resolveCustomResponseBody(
				customBody({
					contentType: ["image/png", "image/jpeg"],
					schema: z.string(),
				}),
				{
					contentType: "image/jpeg",
					payload: "jpeg bytes",
				},
				"Unsupported custom response body contentType.",
			),
			{
				contentType: "image/jpeg",
				payload: "jpeg bytes",
			},
		);
	});

	it("rejects undeclared custom response content types", () => {
		assert.throws(
			() =>
				resolveCustomResponseBody(
					customBody({
						contentType: ["image/png", "image/jpeg"],
						schema: z.string(),
					}),
					{
						contentType: "image/webp",
						payload: "webp bytes",
					},
					"Unsupported custom response body contentType.",
				),
			/Unsupported custom response body contentType/,
		);
	});
});

describe("validateResponseStreamChunks", () => {
	it("validates streamed response chunks", async () => {
		async function* rows() {
			yield "id,title\n";
		}

		const chunks = validateResponseStreamChunks(
			rows(),
			stream(
				customBody({
					contentType: "text/csv",
					schema: z.number(),
				}),
			),
		);

		await assert.rejects(async () => {
			for await (const _chunk of chunks) {
				void _chunk;
			}
		}, /Stream response validation failed/);
	});
});
