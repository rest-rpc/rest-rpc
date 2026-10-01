import { type, type InferClientResponse } from "@rest-rpc/core";
import { serverFirstRoute as route } from "./routeBuilder.ts";

describe("routeBuilder types", () => {
	it("infers response statuses and bodies from handlers", () => {
		const implementation = route
			.get("/")
			.handler(() => ({ status: 201, body: { id: "new" } }));
		type Response = InferClientResponse<typeof implementation>;
		expectTypeOf<Response["status"]>().toEqualTypeOf<201>();
		expectTypeOf<Response["body"]>().toEqualTypeOf<{ readonly id: "new" }>();
	});

	it("checks declared response statuses and bodies", () => {
		const declared = route.get("/").response(200, type<{ id: string }>());
		declared.handler(() => ({ status: 200, body: { id: "ok" } }));
		// @ts-expect-error The route only declares status 200.
		declared.handler(() => ({ status: 404, body: { id: "missing" } }));
		// @ts-expect-error The declared body requires a string id.
		declared.handler(() => ({ status: 200, body: { id: 1 } }));
	});

	it("rejects handlers mixing plain outputs and response envelopes", () => {
		// @ts-expect-error Inferred handlers must use a single output mode.
		route.handler(() =>
			Math.random() > 0.5 ? "plain" : { status: 200, body: "envelope" },
		);
	});

	it("limits context access and writes to declared keys and values", () => {
		route.$context<{ count: number }>().handler(({ context }) => {
			context.set("count", 1);
			expectTypeOf(context.get("count")).toEqualTypeOf<number>();
			// @ts-expect-error Context keys must be declared.
			context.get("missing");
			// @ts-expect-error Context values must match their key.
			context.set("count", "1");
			return "ok";
		});
	});
});
