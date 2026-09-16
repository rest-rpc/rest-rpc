import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient } from "@rest-rpc/core/client";
import type { StartedServer } from "../harness/listen.ts";
import { bodyParsingContract } from "./contract.ts";

type BodyParsingSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

const readJson = async (response: Response) =>
	response.json() as Promise<unknown>;

const assertContentTypeRejection = async (response: Response) => {
	assert.equal(response.status, 415);
	assert.deepEqual(await readJson(response), {
		message: "Unsupported request body content type.",
	});
};

export const runBodyParsingSuite = (adapter: BodyParsingSuiteAdapter) => {
	describe(`${adapter.name} body parsing integration`, () => {
		let server: StartedServer;

		before(async () => {
			server = await adapter.start();
		});

		after(async () => {
			await server.close();
		});

		it("parses standard JSON request bodies", async () => {
			const response = await fetch(`${server.origin}/body-parsing/json`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					count: 3,
					title: "Parsed JSON",
				}),
			});

			assert.equal(response.status, 200);
			assert.deepEqual(await readJson(response), {
				count: 3,
				title: "Parsed JSON",
			});
		});

		it("parses custom text/plain request bodies as raw text", async () => {
			const response = await fetch(`${server.origin}/body-parsing/text`, {
				method: "POST",
				headers: {
					"content-type": "text/plain",
				},
				body: '{"not":"json"}',
			});

			assert.equal(response.status, 200);
			assert.deepEqual(await readJson(response), {
				body: '{"not":"json"}',
			});
		});

		it("parses custom bodies with a selected declared content type", async () => {
			const response = await fetch(
				`${server.origin}/body-parsing/text-variant`,
				{
					method: "POST",
					headers: {
						"content-type": "text/markdown; charset=utf-8",
					},
					body: "# Parsed markdown",
				},
			);

			assert.equal(response.status, 200);
			assert.deepEqual(await readJson(response), {
				body: "# Parsed markdown",
			});
		});

		it("rejects undeclared custom body content types", async () => {
			const response = await fetch(
				`${server.origin}/body-parsing/text-variant`,
				{
					method: "POST",
					headers: {
						"content-type": "application/xml",
					},
					body: "<title>Wrong parser</title>",
				},
			);

			await assertContentTypeRejection(response);
		});

		it("parses custom JSON request bodies with content-type parameters", async () => {
			const response = await fetch(
				`${server.origin}/body-parsing/custom-json`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json; charset=utf-8",
					},
					body: JSON.stringify({
						count: 5,
						nested: { ok: true },
					}),
				},
			);

			assert.equal(response.status, 200);
			assert.deepEqual(await readJson(response), {
				count: 5,
				ok: true,
			});
		});

		it("sends URLSearchParams directly through the default codec", async () => {
			const client = initClient(bodyParsingContract, {
				baseUrl: server.origin,
			});
			const response = await client.formUrlEncoded({
				query: {},
				body: new URLSearchParams({ count: "7", title: "Typed form" }),
			});
			assert.equal(response.status, 200);
			assert.deepEqual(response.body, { count: "7", title: "Typed form" });
		});

		it("preserves repeated URLSearchParams fields and query arrays", async () => {
			const client = initClient(bodyParsingContract, {
				baseUrl: server.origin,
			});
			const response = await client.formUrlEncoded({
				query: { filters: ["open", "assigned"] },
				body: new URLSearchParams([
					["count", "2"],
					["title", "Array fields"],
					["tags", "typescript"],
					["tags", "rpc"],
				]),
			});
			assert.equal(response.status, 200);
			assert.deepEqual(response.body, {
				count: "2",
				title: "Array fields",
				filters: ["open", "assigned"],
				tags: ["typescript", "rpc"],
			});
		});

		it("sends Blob bodies directly through the default codec", async () => {
			const client = initClient(bodyParsingContract, {
				baseUrl: server.origin,
			});
			const response = await client.binary({
				body: new Blob([new Uint8Array([0, 1, 127, 128, 255])], {
					type: "application/octet-stream",
				}),
			});
			assert.equal(response.status, 200);
			assert.deepEqual(response.body, {
				byteLength: 5,
				bytes: [0, 1, 127, 128, 255],
			});
		});

		it("rejects text bodies sent to JSON routes", async () => {
			const response = await fetch(`${server.origin}/body-parsing/json`, {
				method: "POST",
				headers: {
					"content-type": "text/plain",
				},
				body: JSON.stringify({
					count: 3,
					title: "Wrong parser",
				}),
			});

			await assertContentTypeRejection(response);
		});

		it("rejects binary bodies sent to text routes", async () => {
			const response = await fetch(`${server.origin}/body-parsing/text`, {
				method: "POST",
				headers: {
					"content-type": "application/octet-stream",
				},
				body: new Uint8Array([65, 66, 67]),
			});

			await assertContentTypeRejection(response);
		});

		it("rejects text bodies sent to binary routes", async () => {
			const response = await fetch(`${server.origin}/body-parsing/binary`, {
				method: "POST",
				headers: {
					"content-type": "text/plain",
				},
				body: "ABC",
			});

			await assertContentTypeRejection(response);
		});

		it("rejects content types on routes without a body declaration", async () => {
			const response = await fetch(`${server.origin}/body-parsing/no-body`, {
				method: "DELETE",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ ignored: true }),
			});

			await assertContentTypeRejection(response);
		});
	});
};
