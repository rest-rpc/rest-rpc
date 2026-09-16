import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { createRouteHandler } from "@rest-rpc/fetch";
import { listen } from "../harness/listen.ts";
import { createBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

const withoutBody = (method: string | undefined) =>
	method === "GET" || method === "HEAD";

runBodyParsingSuite({
	name: "fetch",
	start: async () => {
		const handler = createRouteHandler(createBodyParsingImplementations());

		return listen(
			createServer(async (req, res) => {
				const request = new Request(`http://127.0.0.1${req.url}`, {
					method: req.method,
					headers: req.headers as HeadersInit,
					body: withoutBody(req.method) ? undefined : Readable.toWeb(req),
					duplex: "half",
				} as RequestInit & { duplex: "half" });
				const result = await handler(request);
				assert(result.matched);
				const response = result.response;

				res.writeHead(response.status, Object.fromEntries(response.headers));
				if (response.body) {
					for await (const chunk of response.body) res.write(chunk);
				}
				res.end();
			}),
		);
	},
});

describe("fetch request codec errors", () => {
	it("rejects unsupported media types before parsing or validation hooks", async () => {
		const handler = createRouteHandler(createBodyParsingImplementations(), {
			bodyCodecs: [
				{
					match: () => true,
					deserialize: () => {
						throw new Error("Parser must not run");
					},
				},
			],
			requestValidationErrorHandler: () => {
				throw new Error("Validation hook must not run");
			},
		});
		const request = new Request("http://127.0.0.1/body-parsing/json", {
			method: "POST",
			headers: { "content-type": "text/plain" },
			body: "{",
		});
		const result = await handler(request);
		assert(result.matched);
		assert.equal(result.response.status, 415);
		assert.equal(request.bodyUsed, false);
	});

	it("returns a parsing 400 when the default JSON parser fails", async () => {
		const handler = createRouteHandler(createBodyParsingImplementations());
		const result = await handler(
			new Request("http://127.0.0.1/body-parsing/json", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			}),
		);
		assert(result.matched);
		const response = result.response;

		assert.equal(response.status, 400);
		assert.match(
			response.headers.get("content-type") ?? "",
			/^application\/json/,
		);
		assert.deepEqual(await response.json(), {
			message: "Invalid request body",
		});
	});

	it("lets custom deserializer errors propagate", async () => {
		const handler = createRouteHandler(createBodyParsingImplementations(), {
			bodyCodecs: [
				{
					match: () => true,
					deserialize: () => {
						throw new Error("custom parser failed");
					},
				},
			],
		});

		await assert.rejects(
			() =>
				handler(
					new Request("http://127.0.0.1/body-parsing/json", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: "{}",
					}),
				),
			/custom parser failed/,
		);
	});
});
