import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initClient } from "./index.ts";

type RuntimeRouteClient = (...args: unknown[]) => Promise<{
	body: unknown;
	contentType?: string;
	status: number;
}>;

type RuntimeClient = {
	$get: (path: string, ...args: unknown[]) => ReturnType<RuntimeRouteClient>;
	$post: (path: string, ...args: unknown[]) => ReturnType<RuntimeRouteClient>;
	get: (...args: unknown[]) => Promise<unknown>;
	todos: {
		get: (...args: unknown[]) => Promise<unknown>;
		add: (...args: unknown[]) => Promise<unknown>;
	};
};

type FetchCall = {
	url: string;
	init?: RequestInit;
};

const response = (body?: BodyInit | null, status = 200, contentType?: string) =>
	new Response(body, {
		status,
		headers: contentType ? { "content-type": contentType } : undefined,
	});

const createClient = (
	responseFactory: () => Response,
	options: {
		bodyParser?: (response: Response) => unknown | Promise<unknown>;
		nextFetchTags?: { enabled: boolean; tagPrefix?: string };
	} = {},
) => {
	const calls: FetchCall[] = [];
	const client = initClient<never>({
		baseUrl: "https://api.test",
		fetch: async (url, init) => {
			calls.push({ url: String(url), init });
			return responseFactory();
		},
		...options,
	}) as unknown as RuntimeClient;

	return { calls, client };
};

describe("initClient server-first mode", () => {
	it("selects a method and path and delegates ordinary requests to fetch", async () => {
		const { calls, client } = createClient(() =>
			response(JSON.stringify({ id: "todo-1" }), 201, "application/json"),
		);

		const result = await client.$post(
			"/accounts/:accountId/todos",
			{
				body: { title: "Todo" },
				headers: { "x-request-id": "request-1" },
				params: { accountId: "account-1" },
				query: { notify: true },
			},
			{ cache: "no-store" },
		);

		assert.equal(result.status, 201);
		assert.deepEqual(result.body, { id: "todo-1" });
		assert.equal(
			calls[0]?.url,
			"https://api.test/accounts/account-1/todos?notify=true",
		);
		assert.equal(calls[0]?.init?.method, "POST");
		assert.equal(calls[0]?.init?.cache, "no-store");
		assert.equal(calls[0]?.init?.body, JSON.stringify({ title: "Todo" }));
		assert.deepEqual(calls[0]?.init?.headers, {
			"content-type": "application/json",
			"x-request-id": "request-1",
		});
	});

	it("accumulates shorthand paths while preserving explicit selectors", async () => {
		const { calls, client } = createClient(() =>
			response(JSON.stringify({ id: "todo-1" }), 200, "application/json"),
		);

		assert.deepEqual(await client.todos.get(undefined, { cache: "no-store" }), {
			id: "todo-1",
		});
		assert.deepEqual(await client.todos.add({ title: "Todo" }), {
			id: "todo-1",
		});
		assert.equal(calls[0]?.url, "https://api.test/todos/get");
		assert.equal(calls[0]?.init?.method, "POST");
		assert.equal(calls[0]?.init?.body, undefined);
		assert.equal(calls[0]?.init?.cache, "no-store");
		assert.equal(calls[1]?.url, "https://api.test/todos/add");
		assert.equal(calls[1]?.init?.method, "POST");
		assert.equal(calls[1]?.init?.body, JSON.stringify({ title: "Todo" }));
		const explicitResult = await client.$get("/todos");
		assert.equal(explicitResult.status, 200);
		assert.deepEqual(explicitResult.body, { id: "todo-1" });
		assert.equal(calls[2]?.url, "https://api.test/todos");
	});

	it("throws native errors for unsuccessful shorthand calls", async () => {
		const { client } = createClient(() =>
			response("{}", 500, "application/json"),
		);

		await assert.rejects(client.todos.get(), Error);
	});

	it("allows a top-level shorthand route to use an HTTP method name", async () => {
		const { calls, client } = createClient(() =>
			response(JSON.stringify({ ok: true }), 200, "application/json"),
		);

		assert.deepEqual(await client.get(), { ok: true });
		assert.equal(calls[0]?.url, "https://api.test/get");
		assert.equal(calls[0]?.init?.method, "POST");
	});

	it("serializes explicit server-first request encodings", async () => {
		const { calls, client } = createClient(() => response(null, 204));

		await client.$post(
			"/form",
			{ body: { title: "Todo", tags: ["docs", "api"] } },
			{ contentType: "application/x-www-form-urlencoded" },
		);
		await client.$post(
			"/multipart",
			{ body: { title: "Todo", tags: ["docs", "api"] } },
			{ contentType: "multipart/form-data" },
		);
		await client.$post(
			"/custom",
			{ body: "id,title\n1,Todo\n" },
			{ contentType: "text/csv" },
		);

		assert.equal(
			String(calls[0]?.init?.body),
			"title=Todo&tags%5B%5D=docs&tags%5B%5D=api",
		);
		assert.deepEqual(Array.from((calls[1]!.init!.body as FormData).entries()), [
			["title", "Todo"],
			["tags[]", "docs"],
			["tags[]", "api"],
		]);
		assert.equal(calls[2]?.init?.body, "id,title\n1,Todo\n");
		assert.deepEqual(calls[2]?.init?.headers, {
			"content-type": "text/csv",
		});
	});

	it("treats a response without content-type as empty", async () => {
		const { client } = createClient(
			() => new Response(new TextEncoder().encode("ignored")),
		);

		const result = await client.$get("/empty");

		assert.equal(result.body, undefined);
	});

	it("reads JSON-compatible content types", async () => {
		const { client } = createClient(() =>
			response(
				JSON.stringify({ title: "Invalid todo" }),
				422,
				"application/problem+json; charset=utf-8",
			),
		);

		const result = await client.$get("/todos");

		assert.deepEqual(result.body, { title: "Invalid todo" });
	});

	it("reads empty, NDJSON, and custom responses", async () => {
		const empty = createClient(() => response(null, 204));
		assert.equal((await empty.client.$get("/empty")).body, undefined);

		const ndjson = createClient(() =>
			response(
				'{"id":"one"}\n{"id":"two"}\n',
				200,
				"application/x-ndjson; charset=utf-8",
			),
		);
		const stream = (await ndjson.client.$get("/stream")).body as AsyncIterable<{
			id: string;
		}>;
		const values = [];
		for await (const value of stream) values.push(value);
		assert.deepEqual(values, [{ id: "one" }, { id: "two" }]);

		const custom = createClient(
			() =>
				new Response("csv", {
					headers: { "content-type": "text/csv" },
				}),
		);
		const customResponse = await custom.client.$get("/export");
		assert.equal(customResponse.body, "csv");
		assert.equal(customResponse.contentType, "text/csv");
	});

	it("uses a custom body parser for server-first custom responses", async () => {
		const { client } = createClient(
			() =>
				new Response("custom", {
					headers: { "content-type": "application/octet-stream" },
				}),
			{ bodyParser: (response) => response.text() },
		);

		const result = await client.$get("/custom");

		assert.equal(result.body, "custom");
	});

	it("uses method:path identities for automatic Next.js tags", async () => {
		const { calls, client } = createClient(() => response(null, 204), {
			nextFetchTags: { enabled: true, tagPrefix: "api" },
		});

		await client.$get("/todos/:id", {
			params: { id: "todo-1" },
			query: { include: "labels" },
		});

		assert.deepEqual(
			(calls[0]!.init as RequestInit & { next?: { tags?: string[] } }).next
				?.tags,
			[
				"api:get:/todos/:id:params:%7B%22id%22%3A%22todo-1%22%7D:query:%7B%22include%22%3A%22labels%22%7D",
				"api:get:/todos/:id",
			],
		);
	});
});
