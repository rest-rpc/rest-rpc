import { type } from "@rest-rpc/core";
import { handleHttpRoute } from "./handleHttpRoute.ts";
import {
	flattenRouteImplementations,
	type RuntimeImplementationTree,
} from "./match.ts";
import { serverFirstRoute as route } from "./routeBuilder.ts";

const execute = (implementation: RuntimeImplementationTree) =>
	handleHttpRoute(flattenRouteImplementations(implementation)[0]!, {
		request: {},
		handlerFields: {},
	});

describe("handleHttpRoute", () => {
	it("normalizes inferred plain, custom, and empty outputs", async () => {
		expect(await execute(route.handler(() => ({ name: "Ada" })))).toMatchObject(
			{
				kind: "response",
				status: 200,
				body: { value: { name: "Ada" }, contentType: "application/json" },
			},
		);
		expect(
			await execute(
				route.handler(() => ({ contentType: "text/plain", data: "hello" })),
			),
		).toMatchObject({ body: { value: "hello", contentType: "text/plain" } });
		const empty = await execute(
			route.get("/").handler(() => ({ status: 204 })),
		);
		expect(empty).toMatchObject({ kind: "response", status: 204 });
		expect(empty).not.toHaveProperty("body");
	});

	it.each([99, 600, 200.5])(
		"rejects an inferred invalid HTTP status %s",
		async (status) => {
			await expect(
				execute(route.get("/").handler(() => ({ status }))),
			).rejects.toThrow("Invalid inferred HTTP response status");
		},
	);

	it("rejects an undeclared response status even with response validation disabled", async () => {
		const declared = route
			.get("/")
			.response(200, type<string>())
			.handler(() => ({ status: 200, body: "ok" }));
		const implementation = {
			...flattenRouteImplementations(declared)[0]!,
			handler: () => ({ status: 404, body: "missing" }),
		};
		await expect(
			handleHttpRoute(implementation, {
				request: {},
				handlerFields: {},
				configuration: { disableResponseValidation: true },
			}),
		).rejects.toThrow("returned undeclared status 404");
	});

	it("requires a declared response content type and normalizes the selection", async () => {
		const declared = route
			.get("/")
			.response(200, type<string>(), {
				contentType: ["text/plain", "text/html"],
			})
			.handler(() => ({ status: 200, body: "ok", contentType: "text/plain" }));
		const implementation = flattenRouteImplementations(declared)[0]!;
		const run = (contentType?: string) =>
			handleHttpRoute(
				{
					...implementation,
					handler: () => ({ status: 200, body: "ok", contentType }),
				},
				{ request: {}, handlerFields: {} },
			);
		expect(await run("Text/Plain; charset=utf-8")).toMatchObject({
			body: { contentType: "text/plain" },
		});
		await expect(run()).rejects.toThrow(
			"Unsupported response body contentType.",
		);
		await expect(run("application/json")).rejects.toThrow(
			"Unsupported response body contentType.",
		);
	});

	it("propagates ordinary handler errors", async () => {
		const error = new Error("handler failed");
		await expect(
			execute(
				route.handler((): string => {
					throw error;
				}),
			),
		).rejects.toBe(error);
	});
});
