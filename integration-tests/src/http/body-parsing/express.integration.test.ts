import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RegisterRoutesOptions } from "@rest-rpc/express";
import { createServer } from "node:http";
import { registerRoutes } from "@rest-rpc/express";
import express from "express";
import { listen } from "../harness/listen.ts";
import { frameworkBodyParsingContract } from "./contract.ts";
import { createFrameworkBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

runBodyParsingSuite({
	name: "express",
	start: async () => {
		const app = express();

		app.use(
			frameworkBodyParsingContract.binary["~restrpc"].path,
			express.raw({ type: "application/octet-stream" }),
		);
		app.use(
			frameworkBodyParsingContract.text["~restrpc"].path,
			express.text({ type: "text/plain" }),
		);
		app.use(
			frameworkBodyParsingContract.textVariant["~restrpc"].path,
			express.text({
				type: ["text/plain", "text/markdown", "application/xml"],
			}),
		);
		app.use(
			frameworkBodyParsingContract.json["~restrpc"].path,
			express.json({ type: "application/json" }),
		);
		app.use(
			frameworkBodyParsingContract.customJson["~restrpc"].path,
			express.json({ type: "application/json" }),
		);
		app.use(
			frameworkBodyParsingContract.formUrlEncoded["~restrpc"].path,
			express.text({ type: "application/x-www-form-urlencoded" }),
			(req, _res, next) => {
				req.body = new URLSearchParams(req.body);
				next();
			},
		);

		registerRoutes(app, createFrameworkBodyParsingImplementations());

		return listen(createServer(app));
	},
});

describe("express user request codecs", () => {
	const start = (options: RegisterRoutesOptions, parsed = true) => {
		const app = express();
		if (parsed) app.use(express.json());
		registerRoutes(app, createFrameworkBodyParsingImplementations(), options);
		app.use(
			(
				error: Error,
				_req: express.Request,
				res: express.Response,
				_next: express.NextFunction,
			) => {
				res.status(500).json({ message: error.message });
			},
		);
		return listen(createServer(app));
	};
	const post = (origin: string, contentType = "application/json") =>
		fetch(`${origin}/body-parsing/json`, {
			method: "POST",
			headers: { "content-type": contentType },
			body: JSON.stringify({ count: 1, title: "parsed" }),
		});

	it("transforms an already parsed body using the first matching user deserializer", async () => {
		const server = await start({
			bodyCodecs: [
				{
					match: () => false,
					deserialize: () => {
						throw new Error("unmatched");
					},
				},
				{
					match: (mediaType) => {
						assert.equal(mediaType, "application/json");
						return true;
					},
					deserialize: async (req) => {
						assert.deepEqual(req.body, { count: 1, title: "parsed" });
						assert.equal(
							req.headers["content-type"],
							"application/json; charset=utf-8",
						);
						return { ...req.body, count: 2 };
					},
				},
				{
					match: () => true,
					deserialize: () => {
						throw new Error("later deserializer");
					},
				},
			],
		});
		try {
			const response = await post(
				server.origin,
				"application/json; charset=utf-8",
			);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { count: 2, title: "parsed" });
		} finally {
			await server.close();
		}
	});

	it("preserves the framework body when user rules supply no matching deserializer", async () => {
		const server = await start({
			bodyCodecs: [
				{
					match: () => false,
					deserialize: () => {
						throw new Error("unmatched");
					},
				},
				{
					match: () => true,
					serialize: (value) => ({ body: JSON.stringify(value) }),
				},
			],
		});
		try {
			const response = await post(server.origin);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { count: 1, title: "parsed" });
		} finally {
			await server.close();
		}
	});

	it("does not apply built-in parsing when Express has not parsed the body", async () => {
		const server = await start({}, false);
		try {
			const response = await post(server.origin);
			assert.equal(response.status, 400);
		} finally {
			await server.close();
		}
	});

	it("lets user codecs read a stream preserved by framework setup", async () => {
		const server = await start(
			{
				bodyCodecs: [
					{
						match: () => true,
						deserialize: async (req) => {
							assert.equal(req.readableFlowing, null);
							let text = "";
							for await (const chunk of req) text += chunk.toString();
							return JSON.parse(text);
						},
					},
				],
			},
			false,
		);
		try {
			const response = await post(server.origin);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { count: 1, title: "parsed" });
		} finally {
			await server.close();
		}
	});

	it("checks content type acceptance before invoking user matchers", async () => {
		let matched = false;
		const server = await start({
			bodyCodecs: [
				{
					match: () => {
						matched = true;
						return true;
					},
					deserialize: () => undefined,
				},
			],
		});
		try {
			const response = await post(server.origin, "text/plain");
			assert.equal(response.status, 415);
			assert.equal(matched, false);
		} finally {
			await server.close();
		}
	});

	it("validates codec results and forwards callback errors to Express", async () => {
		const server = await start({
			bodyCodecs: [
				{
					match: () => true,
					deserialize: (req) => {
						if (req.headers["x-fail"]) throw new Error("custom codec failed");
						return { count: "invalid", title: "parsed" };
					},
				},
			],
		});
		try {
			assert.equal((await post(server.origin)).status, 400);
			const response = await fetch(`${server.origin}/body-parsing/json`, {
				method: "POST",
				headers: { "content-type": "application/json", "x-fail": "true" },
				body: "{}",
			});
			assert.equal(response.status, 500);
			assert.deepEqual(await response.json(), {
				message: "custom codec failed",
			});
		} finally {
			await server.close();
		}
	});
});
