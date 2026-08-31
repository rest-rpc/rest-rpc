import {
	type ApiClientFor,
	type ClientEventSource,
	type ClientResponse,
	type StrictApiClientFor,
	type StrictClientResponse,
	type ClientResponseBody,
	type ClientSseReceived,
	initClient,
	route,
	type as schemaType,
	webSocketMessages,
} from "@rest-rpc/core";
import { expectError, expectType } from "tsd";
import { z } from "zod";

const todoSchema = z.object({
	id: z.string(),
	title: z.string(),
});

const noInputApi = {
	todos: {
		list: route.get("/todos").response(200, z.array(todoSchema)),
		stats: route
			.get("/todos/stats")
			.response(200, schemaType<{ total: number }>()),
	},
};

const noInputClient = initClient(noInputApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<Array<{ id: string; title: string }>>>(
	noInputClient.todos.list.fetch(),
);
expectType<Promise<{ total: number }>>(noInputClient.todos.stats.fetch());

const pathParamApi = {
	todos: {
		get: route
			.get("/todos/:id")
			.pathParams(z.object({ id: z.string() }))
			.response(200, todoSchema),
	},
};

const pathParamClient = initClient(pathParamApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<{ id: string; title: string }>>(
	pathParamClient.todos.get.fetch({ id: "todo-1" }),
);

const flatQueryApi = {
	todos: {
		search: route
			.get("/todos/search")
			.query(
				z.object({
					includeDone: z.boolean().optional(),
					page: z.number(),
					search: z.string(),
				}),
			)
			.response(200, z.array(todoSchema)),
	},
};

const flatQueryClient = initClient(flatQueryApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<Array<{ id: string; title: string }>>>(
	flatQueryClient.todos.search.fetch({
		includeDone: false,
		page: 1,
		search: "milk",
	}),
);

const groupedRequestApi = {
	todos: {
		create: route
			.post("/todos/:accountId")
			.flattenRequestKeys(false)
			.pathParams(z.object({ accountId: z.string() }))
			.query(z.object({ notify: z.boolean() }))
			.body(z.object({ title: z.string() }))
			.headers({ authorization: z.string() })
			.response(201, todoSchema),
	},
};

const groupedRequestClient = initClient(groupedRequestApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<{ id: string; title: string }>>(
	groupedRequestClient.todos.create.fetch({
		body: { title: "Write type tests" },
		headers: { authorization: "Bearer token" },
		pathParams: { accountId: "account-1" },
		query: { notify: true },
	}),
);
expectError(
	groupedRequestClient.todos.create.fetch({
		accountId: "account-1",
		authorization: "Bearer token",
		notify: true,
		title: "Write type tests",
	}),
);

const groupedRequestFactory = route.with({ flattenRequestKeys: false });
const groupedRequestWithApi = {
	todos: {
		create: groupedRequestFactory
			.post("/todos/:accountId")
			.pathParams(z.object({ accountId: z.string() }))
			.query(z.object({ notify: z.boolean() }))
			.body(z.object({ title: z.string() }))
			.response(201, todoSchema),
	},
};

const groupedRequestWithClient = initClient(groupedRequestWithApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<{ id: string; title: string }>>(
	groupedRequestWithClient.todos.create.fetch({
		body: { title: "Write type tests" },
		pathParams: { accountId: "account-1" },
		query: { notify: true },
	}),
);
expectError(
	groupedRequestWithClient.todos.create.fetch({
		accountId: "account-1",
		notify: true,
		title: "Write type tests",
	}),
);

const jsonQueryApi = {
	todos: {
		jsonSearch: route
			.get("/todos/json-search")
			.jsonQuery(
				z.object({
					page: z.string().transform((value) => Number(value)),
					filters: z.object({ tags: z.array(z.string()) }),
				}),
			)
			.response(200, z.array(todoSchema)),
		optionalJsonSearch: route
			.get("/todos/optional-json-search")
			.jsonQuery(z.object({ page: z.number() }).optional())
			.response(200, z.array(todoSchema)),
	},
};

const jsonQueryClient = initClient(jsonQueryApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<Array<{ id: string; title: string }>>>(
	jsonQueryClient.todos.jsonSearch.fetch({
		query: {
			page: "1",
			filters: { tags: ["api"] },
		},
	}),
);
expectError(jsonQueryClient.todos.jsonSearch.fetch({ page: "1" }));
expectError(jsonQueryClient.todos.jsonSearch.fetch());
expectType<Promise<Array<{ id: string; title: string }>>>(
	jsonQueryClient.todos.optionalJsonSearch.fetch({ query: undefined }),
);
expectError(jsonQueryClient.todos.optionalJsonSearch.fetch({}));
expectError(jsonQueryClient.todos.optionalJsonSearch.fetch());

const responseApi = {
	todos: {
		create: route
			.post("/todos")
			.body(z.object({ title: z.string() }))
			.response(201, {
				body: todoSchema,
				headers: {
					location: z.string(),
					"x-next-cursor": z.string().optional(),
				},
			}),
	},
};

const responseClient = initClient(responseApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<{ id: string; title: string }>>(
	responseClient.todos.create.fetch({ title: "Write type tests" }),
);

responseClient.todos.create
	.fetchResponse({ title: "Write type tests" })
	.then((response) => {
		if (response.declared) {
			expectType<201>(response.status);
			expectType<{ id: string; title: string }>(response.body);
			expectType<string>(response.responseHeaders.location);
			expectType<string | undefined>(response.responseHeaders["x-next-cursor"]);
			expectType<Headers>(response.headers);
		}
	});

const strictResponseApi = {
	todos: {
		get: route
			.get("/todos/:id")
			.pathParams(z.object({ id: z.string() }))
			.response(200, todoSchema)
			.response(404, z.object({ code: z.literal("not_found") })),
	},
};

const strictResponseClient = initClient(strictResponseApi, {
	baseUrl: "https://example.test",
	strictStatusCodes: true,
});

strictResponseClient.todos.get
	.fetchResponse({ id: "todo-1" })
	.then((response) => {
		expectType<200 | 404>(response.status);
		expectType<Headers>(response.headers);
		expectError(response.declared);

		if (response.status === 200) {
			expectType<{ id: string; title: string }>(response.body);
		} else {
			expectType<{ code: "not_found" }>(response.body);
		}
	});

type StrictClientResponseType = StrictClientResponse<
	typeof strictResponseApi.todos.get
>;

expectType<Promise<StrictClientResponseType>>(
	strictResponseClient.todos.get.fetchResponse({ id: "todo-1" }),
);
expectType<ApiClientFor<typeof strictResponseApi, true>>(strictResponseClient);
expectType<StrictApiClientFor<typeof strictResponseApi>>(strictResponseClient);

const transformedApi = {
	todos: {
		transform: route
			.post("/todos/:id/transform")
			.pathParams(
				z.object({ id: z.string() }).transform(({ id }) => ({
					id: Number(id),
				})),
			)
			.body(
				z.object({ title: z.string() }).transform(({ title }) => ({
					title: title.trim(),
					slug: title.toLowerCase(),
				})),
			)
			.response(
				200,
				z.object({ id: z.number() }).transform(({ id }) => ({
					id: String(id),
				})),
			),
	},
};

const transformedClient = initClient(transformedApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<{ id: string }>>(
	transformedClient.todos.transform.fetch({
		id: "1",
		title: "Write type tests",
	}),
);
expectError(
	transformedClient.todos.transform.fetch({ id: 1, title: "wrong id input" }),
);
expectError(
	transformedClient.todos.transform.fetch({
		id: "1",
		title: "Write type tests",
		slug: "server-output-only",
	}),
);

const streamResponseApi = {
	todos: {
		events: route
			.get("/todos/events")
			.streamResponse(200, todoSchema)
			.response(202, todoSchema)
			.response(204),
	},
};

const streamResponseClient = initClient(streamResponseApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<ClientResponse<typeof streamResponseApi.todos.events>>>(
	streamResponseClient.todos.events.fetchResponse(),
);
expectError(streamResponseClient.todos.events.fetch());

const csvResponseApi = {
	todos: {
		exportCsv: route.get("/todos.csv").customResponse(200, {
			contentType: "text/csv",
			schema: z.string(),
		}),
		exportCsvStream: route.get("/todos-stream.csv").customStreamResponse(200, {
			contentType: "text/csv",
			schema: z.string(),
		}),
	},
};

const csvResponseClient = initClient(csvResponseApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<Response>>(csvResponseClient.todos.exportCsv.fetch());

csvResponseClient.todos.exportCsv.fetchResponse().then((response) => {
	if (response.declared) {
		expectType<"text/csv">(response.contentType);
		expectType<Response>(response.body);
	}
});

expectType<Promise<Response>>(csvResponseClient.todos.exportCsvStream.fetch());

const imageResponseApi = {
	todos: {
		exportImage: route.get("/todos/image").customResponse(200, {
			contentType: ["image/png", "image/jpeg"],
			schema: z.instanceof(Uint8Array),
		}),
	},
};

const imageResponseClient = initClient(imageResponseApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<Response>>(imageResponseClient.todos.exportImage.fetch());

imageResponseClient.todos.exportImage.fetchResponse().then((response) => {
	if (response.declared) {
		expectType<"image/png" | "image/jpeg">(response.contentType);
		expectType<Response>(response.body);
	}
});

const customRequestApi = {
	todos: {
		uploadImage: route
			.post("/todos/:id/image")
			.pathParams(z.object({ id: z.string() }))
			.customBody({
				contentType: ["image/png", "image/jpeg"],
				schema: z.instanceof(Uint8Array),
			})
			.response(204),
	},
};

const customRequestClient = initClient(customRequestApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<undefined>>(
	customRequestClient.todos.uploadImage.fetch({
		id: "todo-1",
		body: {
			contentType: "image/png",
			payload: new Uint8Array(),
		},
	}),
);
expectError(
	customRequestClient.todos.uploadImage.fetch({
		id: "todo-1",
		body: {
			contentType: "image/webp",
			payload: new Uint8Array(),
		},
	}),
);

const rawCustomRequestApi = {
	todos: {
		submitForm: route
			.post("/todos/form")
			.customBody(z.instanceof(URLSearchParams))
			.response(204),
	},
};

const rawCustomRequestClient = initClient(rawCustomRequestApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<undefined>>(
	rawCustomRequestClient.todos.submitForm.fetch({
		body: new URLSearchParams(),
	}),
);
expectError(
	rawCustomRequestClient.todos.submitForm.fetch({
		body: "title=Write+docs",
	}),
);

const requestArgumentApi = {
	todos: {
		list: route.get("/todos").response(200, z.array(todoSchema)),
		get: route
			.get("/todos/:id")
			.pathParams(z.object({ id: z.string() }))
			.response(200, todoSchema),
		create: route
			.post("/todos")
			.body(z.object({ title: z.string() }))
			.response(201, todoSchema),
	},
};

const requestArgumentClient = initClient(requestArgumentApi, {
	baseUrl: "https://example.test",
});

expectError(requestArgumentClient.todos.get.fetch());
expectError(requestArgumentClient.todos.get.fetch({ title: "wrong segment" }));
expectError(requestArgumentClient.todos.list.fetch({ id: "todo-1" }));

const globalHeadersApi = {
	todos: {
		search: route
			.get("/todos/search")
			.query(z.object({ search: z.string() }))
			.headers({
				authorization: z.string(),
				"x-request-id": z.string(),
			})
			.response(200, z.array(todoSchema)),
		secure: route
			.get("/todos/secure")
			.headers({
				authorization: z.string(),
			})
			.response(200, z.array(todoSchema)),
	},
};

const globalHeadersClient = initClient(globalHeadersApi, {
	baseUrl: "https://example.test",
	getGlobalHeaders: () => ({
		authorization: "Bearer token",
	}),
});

globalHeadersClient.todos.search.fetch({
	search: "milk",
	"x-request-id": "req-1",
});
globalHeadersClient.todos.search.fetch({
	authorization: "Bearer override",
	search: "milk",
	"x-request-id": "req-1",
});
globalHeadersClient.todos.secure.fetch({});
expectError(globalHeadersClient.todos.search.fetch({ search: "milk" }));
expectError(
	globalHeadersClient.todos.search.fetch({ "x-request-id": "req-1" }),
);
expectError(globalHeadersClient.todos.secure.fetch());

const looseGlobalHeadersClient = initClient(globalHeadersApi, {
	baseUrl: "https://example.test",
	getGlobalHeaders: (): Record<string, string> => ({
		authorization: "Bearer token",
	}),
});

expectError(looseGlobalHeadersClient.todos.search.fetch({}));
expectError(looseGlobalHeadersClient.todos.search.fetch({ search: "milk" }));
expectError(looseGlobalHeadersClient.todos.search.fetch());

const websocketApi = {
	todos: {
		socket: route
			.ws("/todos/socket")
			.clientMessages(
				webSocketMessages("action", {
					echo: z.object({ text: z.string() }),
					count: z.object({
						value: z.string().transform((value) => Number(value)),
					}),
				}),
			)
			.serverMessages({
				discriminator: "type",
				schemas: {
					ready: z.object({
						createdAt: z
							.string()
							.datetime()
							.transform((value) => new Date(value)),
					}),
					event: z.string(),
				},
			}),
	},
};

const websocketClient = initClient(websocketApi, {
	baseUrl: "https://example.test",
});

const socket = websocketClient.todos.socket.openConnection();

socket.send({ action: "echo", message: { text: "hello" } });
socket.send({ action: "count", message: { value: "1" } });
expectError(socket.send({ action: "count", message: { value: 1 } }));
expectError(socket.send({ action: "missing", message: {} }));

socket.onMessage((message) => {
	if (message.type === "ready") {
		expectType<Date>(message.message.createdAt);
	} else {
		expectType<"event">(message.type);
		expectType<string>(message.message);
	}
});

const sseApi = {
	todos: {
		events: route
			.sse("/todos/:id/events")
			.pathParams(z.object({ id: z.string() }))
			.query(z.object({ includeDone: z.boolean().optional() }))
			.response(
				z.object({
					id: z.string(),
					createdAt: z.string().transform((value) => new Date(value)),
				}),
			),
	},
};

const sseClient = initClient(sseApi, {
	baseUrl: "https://example.test",
});

const events = sseClient.todos.events.openConnection({
	id: "todo-1",
	includeDone: false,
});

expectType<ClientEventSource<typeof sseApi.todos.events>>(events);
expectType<EventSource>(events.raw);
expectType<number>(events.readyState);
expectType<string>(events.url);

events.onMessage((message) => {
	expectType<string>(message.id);
	expectType<Date>(message.createdAt);
});

expectType<ClientSseReceived<typeof sseApi.todos.events>>({
	id: "event-1",
	createdAt: new Date(),
});
expectType<never>(
	null as unknown as ClientResponseBody<typeof sseApi.todos.events>,
);
expectType<never>(
	null as unknown as ClientResponse<typeof sseApi.todos.events>,
);

expectError(sseClient.todos.events.fetch());
expectError(sseClient.todos.events.fetchResponse());
expectError(sseClient.todos.events.openConnection());
expectError(
	sseClient.todos.events.openConnection({
		id: "todo-1",
		includeDone: "false",
	}),
);
