import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	deserializeBody,
	normalizeMediaType,
	resolveBodyDeserializer,
	serializeBody,
} from "./index.ts";
import type { BodyCodec } from "./index.ts";

describe("body codecs", () => {
	it("matches base media types while retaining original callback headers and declarations", async () => {
		const codec: BodyCodec<Response> = {
			match: (mediaType) => {
				assert.equal(mediaType, "text/plain");
				return true;
			},
			serialize: (value, declaredContentType) => {
				assert.equal(declaredContentType, "Text/Plain; charset=utf-8");
				return { body: value };
			},
			deserialize: (source) => {
				assert.equal(
					source.headers.get("content-type"),
					"Text/Plain; charset=utf-8",
				);
				return source.text();
			},
		};
		assert.equal(
			normalizeMediaType(" Text/Plain ; charset=utf-8"),
			"text/plain",
		);
		assert.equal(
			(await serializeBody("hello", "Text/Plain; charset=utf-8", [codec]))
				.contentType,
			"Text/Plain; charset=utf-8",
		);
		assert.equal(
			await deserializeBody(
				new Response("hello", {
					headers: { "content-type": "Text/Plain; charset=utf-8" },
				}),
				[codec],
			),
			"hello",
		);
	});

	it("resolves operations independently and skips matchers without that operation", async () => {
		const codecs: BodyCodec<Response>[] = [
			{
				match: () => {
					throw new Error("Inert rule must not match");
				},
			},
			{ match: () => true, serialize: () => ({ body: "custom" }) },
			{ match: () => true, deserialize: () => "first" },
			{
				match: () => true,
				deserialize: () => {
					throw new Error("Later rule must not run");
				},
			},
		];
		assert.equal(
			(await serializeBody({}, "application/json", codecs)).body,
			"custom",
		);
		assert.equal(await deserializeBody(Response.json({}), codecs), "first");
		assert.deepEqual(
			await deserializeBody(Response.json({ ok: true }), [
				codecs[0],
				codecs[1],
			]),
			{ ok: true },
		);
	});

	it("bypasses missing or empty content types without reading bytes or matching rules", async () => {
		for (const contentType of [undefined, "", "  "]) {
			const response = new Response(new Uint8Array([1]), {
				headers:
					contentType === undefined ? {} : { "content-type": contentType },
			});
			assert.equal(
				await deserializeBody(response, [
					{
						match: () => {
							throw new Error("Must not match");
						},
						deserialize: () => "wrong",
					},
				]),
				undefined,
			);
			assert.equal(response.bodyUsed, false);
		}
	});

	it("returns undefined for absent bodies but preserves JSON null", async () => {
		for (const type of [
			"application/json",
			"text/plain",
			"application/octet-stream",
			"multipart/form-data",
			"application/x-www-form-urlencoded",
		]) {
			assert.equal(
				await deserializeBody(
					new Response(null, { headers: { "content-type": type } }),
				),
				undefined,
			);
		}
		assert.equal(await deserializeBody(Response.json(null)), null);
	});

	it("parses zero-byte streams according to their media type", async () => {
		const emptyResponse = (contentType: string) =>
			new Response(new Uint8Array(), {
				headers: { "content-type": contentType },
			});
		await assert.rejects(
			deserializeBody(emptyResponse("application/json")),
			SyntaxError,
		);
		await assert.rejects(
			deserializeBody(emptyResponse("multipart/form-data; boundary=test")),
			TypeError,
		);
		assert.equal(await deserializeBody(emptyResponse("text/plain")), "");
		const form = await deserializeBody(
			emptyResponse("application/x-www-form-urlencoded"),
		);
		assert.ok(form instanceof URLSearchParams);
		assert.equal(form.size, 0);
		const binary = await deserializeBody(
			emptyResponse("application/octet-stream"),
		);
		assert.ok(binary instanceof Blob);
		assert.equal(binary.size, 0);
	});

	it("round trips plain defaults, including structured JSON suffixes and multipart files", async () => {
		const form = new FormData();
		form.append("title", "Hello");
		form.append(
			"file",
			new File(["contents"], "hello.txt", { type: "text/plain" }),
		);
		for (const [type, value] of [
			["application/json", { title: "Hello", nested: [1] }],
			["application/problem+json", { detail: "Hello" }],
			["text/csv", "title\nHello"],
			[
				"application/x-www-form-urlencoded",
				new URLSearchParams([
					["title", "Hello"],
					["title", "Again"],
				]),
			],
			["multipart/form-data", form],
			[
				"image/png",
				new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
			],
		] as const) {
			const output = await serializeBody(value, type);
			const headers = output.contentType
				? { "content-type": output.contentType }
				: undefined;
			const response = new Response(output.body as BodyInit, { headers });
			const parsed = await deserializeBody(response);
			if (value instanceof FormData) {
				assert.ok(parsed instanceof FormData);
				assert.equal(parsed.get("title"), "Hello");
				const file = parsed.get("file");
				assert.ok(file instanceof File);
				assert.equal(file.name, "hello.txt");
				assert.equal(await file.text(), "contents");
				assert.match(response.headers.get("content-type")!, /boundary=/);
			} else if (value instanceof Blob) {
				assert.ok(parsed instanceof Blob);
				assert.deepEqual(await parsed.arrayBuffer(), await value.arrayBuffer());
			} else if (value instanceof URLSearchParams) {
				assert.ok(parsed instanceof URLSearchParams);
				assert.equal(parsed.toString(), value.toString());
			} else assert.deepEqual(parsed, value);
			assert.equal(response.bodyUsed, true);
		}
	});

	it("rejects implicit form and binary conversion and malformed JSON", async () => {
		for (const type of [
			"application/x-www-form-urlencoded",
			"multipart/form-data",
			"text/plain",
			"application/octet-stream",
		]) {
			await assert.rejects(serializeBody({ title: "Hello" }, type), TypeError);
		}
		await assert.rejects(
			serializeBody(undefined, "application/json"),
			TypeError,
		);
		await assert.rejects(
			deserializeBody(
				new Response("{", { headers: { "content-type": "application/json" } }),
			),
			SyntaxError,
		);
	});

	it("allows parameter directives and neutral output while rejecting reserved headers and protocol changes", async () => {
		const body = { native: true };
		assert.equal(
			(
				await serializeBody({}, "text/plain", [
					{
						match: () => true,
						serialize: () => ({
							body,
							headers: { "x-count": 2 },
							contentType: "text/plain; charset=utf-8",
						}),
					},
				])
			).body,
			body,
		);
		for (const name of [
			"Content-Type",
			"CONTENT-Length",
			"transfer-encoding",
		]) {
			await assert.rejects(
				serializeBody({}, "text/plain", [
					{
						match: () => true,
						serialize: () => ({ body: "", headers: { [name]: "bad" } }),
					},
				]),
				/Codec headers/,
			);
		}
		await assert.rejects(
			serializeBody({}, "text/plain", [
				{
					match: () => true,
					serialize: () => ({ body: "", contentType: "application/json" }),
				},
			]),
			/base media type/,
		);
		assert.equal(
			(
				await serializeBody({}, "text/plain", [
					{
						match: () => true,
						serialize: () => ({ body: "", contentType: null }),
					},
				])
			).contentType,
			null,
		);
	});

	it("can resolve a native custom deserializer without Fetch adaptation", async () => {
		const source = { native: true };
		const codecs: BodyCodec<typeof source>[] = [
			{ match: () => true, deserialize: (request) => request },
		];
		assert.equal(
			await resolveBodyDeserializer("application/json", codecs)!(source),
			source,
		);
		assert.equal(resolveBodyDeserializer("application/json", []), undefined);
	});
});
