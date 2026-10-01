import Fastify from "fastify";
import { route, type } from "./index.ts";
import { registerRoutes } from "./registerRoutes.ts";

describe("registerRoutes", () => {
	it("awaits pre-handlers and supplies the native Fastify request and reply", async () => {
		const app = Fastify();
		const calls: string[] = [];
		registerRoutes(
			app,
			{
				get: route
					.get("/users/{id}")
					.params(type<{ id: string }>())
					.handler(({ params, req, reply, signal }) => {
						calls.push("handler");
						expect(signal).toBeInstanceOf(AbortSignal);
						reply.header("x-method", req.method);
						return { status: 200, body: { id: params.id } };
					}),
			},
			{
				preHandler: [
					async (_req, _reply, declaration) => {
						await Promise.resolve();
						expect(declaration.path).toBe("/users/{id}");
						calls.push("preHandler");
					},
				],
			},
		);
		try {
			const response = await app.inject({ url: "/users/42" });
			expect(response.json()).toEqual({ id: "42" });
			expect(response.headers["x-method"]).toBe("GET");
			expect(calls).toEqual(["preHandler", "handler"]);
		} finally {
			await app.close();
		}
	});

	it("lets route headers override codec headers and uses the codec content type", async () => {
		const app = Fastify();
		registerRoutes(
			app,
			{
				get: route.get("/message").handler(() => ({
					status: 200,
					body: "hello",
					responseHeaders: { "x-source": "route" },
				})),
			},
			{
				bodyCodecs: [
					{
						match: (mediaType) => mediaType === "application/json",
						serialize: (value) => ({
							body: String(value),
							contentType: "application/json; charset=utf-8",
							headers: { "x-source": "codec" },
						}),
					},
				],
			},
		);
		try {
			const response = await app.inject({ url: "/message" });
			expect(response.body).toBe("hello");
			expect(response.headers["x-source"]).toBe("route");
			expect(response.headers["content-type"]).toBe(
				"application/json; charset=utf-8",
			);
		} finally {
			await app.close();
		}
	});
});
