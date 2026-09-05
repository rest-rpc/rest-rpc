import type { ServerFirstClientInitializer } from "@rest-rpc/core";
import type { ServerRouteFactory } from "@rest-rpc/server";
import { sseEvent } from "@rest-rpc/server";
import { expectError, expectType } from "tsd";
import { z } from "zod";

declare const route: ServerRouteFactory;
declare const initClient: ServerFirstClientInitializer;

const todo = z.object({ id: z.string(), title: z.string() });

const routes = {
	todos: {
		create: route
			.post("/todos/:accountId")
			.params(z.object({ accountId: z.string() }))
			.query(z.object({ notify: z.boolean() }))
			.body(z.object({ title: z.string() }))
			.response(201, todo)
			.handler(({ accountId, notify, title }) => ({
				status: 201,
				body: { id: accountId, title: notify ? title : title },
			})),
		get: route
			.with({ strictStatusCodes: false })
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(200, todo)
			.response(404, z.object({ code: z.literal("not_found") }))
			.handler(({ id }) =>
				id === "missing"
					? { status: 404 as const, body: { code: "not_found" as const } }
					: { status: 200 as const, body: { id, title: "Todo" } },
			),
		stream: route.get("/todos/stream").handler(() => ({
			status: 200,
			body: (async function* () {
				yield { id: "todo-1", title: "Todo" };
			})(),
		})),
		inferred: route
			.get("/inferred-todos/:id")
			.params(z.object({ id: z.string() }))
			.handler(({ id }) =>
				id === "missing"
					? { status: 404 as const, body: { code: "not_found" as const } }
					: { status: 200 as const, body: { id, title: "Todo" } },
			),
	},
	events: route
		.sse("/events")
		.response(z.object({ id: z.string() }))
		.handler(async function* () {
			yield sseEvent({ id: "todo-1" });
		}),
} as const;

const client = initClient<typeof routes>({ baseUrl: "https://example.test" });

// Client inputs are grouped even though the server handler uses flattened keys.
expectType<Promise<{ id: string; title: string }>>(
	client.post("/todos/:accountId").fetch({
		body: { title: "Write tests" },
		params: { accountId: "account-1" },
		query: { notify: true },
	}),
);
expectError(
	client.post("/todos/:accountId").fetch({
		accountId: "account-1",
		notify: true,
		title: "Write tests",
	}),
);

// Selection is restricted to method/path pairs present in the implementation tree.
expectError(client.get("/todos/:accountId"));
expectError(client.post("/todos/:id"));

// Server-first responses are always strict, even when the server option is false.
client
	.get("/todos/:id")
	.fetchResponse({ params: { id: "todo-1" } })
	.then((response) => {
		expectType<200 | 404>(response.status);
		expectError(response.declared);

		if (response.status === 200) {
			expectType<{ id: string; title: string }>(response.body);
		} else {
			expectType<{ code: "not_found" }>(response.body);
		}
	});

// Inferred response kinds flow through the existing client stream model.
expectType<Promise<AsyncIterable<{ id: string; title: string }>>>(
	client.get("/todos/stream").fetch(),
);

client
	.get("/inferred-todos/:id")
	.fetchResponse({ params: { id: "todo-1" } })
	.then((response) => {
		if (response.status === 200) {
			expectType<string>(response.body.id);
			expectType<"Todo">(response.body.title);
		} else {
			expectType<404>(response.status);
			expectType<"not_found">(response.body.code);
		}
	});

client
	.sse("/events")
	.openConnection()
	.onMessage((message) => {
		expectType<{ id: string }>(message);
	});
expectError(client.get("/events"));
