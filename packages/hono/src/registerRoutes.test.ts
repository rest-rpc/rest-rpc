import { Hono } from "hono";
import { route, type } from "./index.ts";
import { registerRoutes } from "./registerRoutes.ts";

describe("registerRoutes", () => {
	it("passes the Hono context and matched route through middleware to the handler", async () => {
		const app = new Hono();
		const calls: string[] = [];
		const get = route
			.get("/users/{id}")
			.params(type<{ id: string }>())
			.handler(({ params, c, signal }) => {
				calls.push("handler");
				expect(signal).toBe(c.req.raw.signal);
				return {
					status: 200,
					body: { id: params.id, header: c.req.header("x-name") },
				};
			});
		registerRoutes(
			app,
			{ get },
			{
				middleware: [
					async (_c, next, declaration) => {
						expect(declaration.path).toBe("/users/{id}");
						calls.push("middleware");
						await next();
					},
				],
			},
		);
		const response = await app.request("/users/42", {
			headers: { "x-name": "Ada" },
		});
		expect(await response.json()).toEqual({ id: "42", header: "Ada" });
		expect(calls).toEqual(["middleware", "handler"]);
	});

	it.each([
		0,
		-1,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
	])(
		"rejects invalid requestBodyLimit %s during registration",
		(requestBodyLimit) => {
			expect(() =>
				registerRoutes(new Hono(), {}, { requestBodyLimit }),
			).toThrow("requestBodyLimit must be a positive safe integer");
		},
	);

	it("applies the body limit before invoking the route handler", async () => {
		const app = new Hono();
		const handler = vi.fn(() => ({ status: 204 as const }));
		registerRoutes(
			app,
			{
				post: route
					.post("/message")
					.body(type<string>(), { contentType: "text/plain" })
					.handler(handler),
			},
			{ requestBodyLimit: 3 },
		);
		expect(
			(
				await app.request("/message", {
					method: "POST",
					headers: { "content-type": "text/plain" },
					body: "abcd",
				})
			).status,
		).toBe(413);
		expect(handler).not.toHaveBeenCalled();
		expect(
			(
				await app.request("/message", {
					method: "POST",
					headers: { "content-type": "text/plain" },
					body: "abc",
				})
			).status,
		).toBe(204);
	});
});
