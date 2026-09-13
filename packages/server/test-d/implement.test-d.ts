import { initClient, route } from "@rest-rpc/core";
import { implement } from "@rest-rpc/server";
import { expectError, expectType } from "tsd";
import { z } from "zod";

const contract = {
	todos: {
		get: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(200, z.object({ id: z.string() })),
		create: route
			.input(z.object({ title: z.string() }), { contentType: "text/plain" })
			.output(z.object({ id: z.string(), title: z.string() })),
		upload: route
			.post("/images")
			.body(z.instanceof(Uint8Array), {
				contentType: ["image/png", "image/jpeg"],
			})
			.response(204),
		download: route.get("/images/:id").response(200, z.instanceof(Uint8Array), {
			contentType: ["image/png", "image/jpeg"],
		}),
		importCsv: route
			.post("/imports.csv")
			.body(z.string(), { contentType: "text/csv" })
			.response(204),
	},
} as const;

const implementor = implement(contract);
const get = implementor.todos.get.handler(({ params }) => ({
	status: 200 as const,
	body: { id: params.id },
}));
expectType<"GET">(get["~restrpc"].method);
expectType<"/todos/:id">(get["~restrpc"].path);

expectError(
	implementor.todos.get.handler(() => ({
		status: 404 as const,
		body: { code: "missing" },
	})),
);

const upload = implementor.todos.upload.handler(({ body, contentType }) => {
	expectType<Uint8Array<ArrayBuffer>>(body);
	expectType<"image/png" | "image/jpeg">(contentType);
	return { status: 204 };
});

const importCsv = implementor.todos.importCsv.handler(
	({ body, contentType }) => {
		expectType<string>(body);
		expectType<"text/csv">(contentType);
		return { status: 204 };
	},
);

const serverFirstClient = initClient<{
	upload: typeof upload;
	importCsv: typeof importCsv;
}>({ baseUrl: "https://example.test" });
serverFirstClient.$post(
	"/images",
	{ body: new Uint8Array() },
	{ contentType: "image/png" },
);
expectError(serverFirstClient.$post("/images", { body: new Uint8Array() }));
serverFirstClient.$post(
	"/imports.csv",
	{ body: "id,title\n1,Todo\n" },
	{ contentType: "text/csv" },
);
expectError(
	serverFirstClient.$post("/imports.csv", { body: "id,title\n1,Todo\n" }),
);

implementor.todos.download.handler(() => ({
	status: 200,
	body: new Uint8Array(),
	contentType: "image/png",
}));
expectError(
	implementor.todos.download.handler(() => ({
		status: 200,
		body: new Uint8Array(),
		contentType: "image/webp",
	})),
);

const create = implementor.todos.create.handler(({ input, contentType }) => {
	expectType<"text/plain">(contentType);
	return {
		id: "todo-1",
		title: input.title,
	};
});
expectType<"procedure">(create["~restrpc"].kind);
const procedureClient = initClient<{ create: typeof create }>({
	baseUrl: "https://example.test",
});
procedureClient.create({ title: "Todo" }, { contentType: "text/plain" });
expectError(procedureClient.create({ title: "Todo" }));
