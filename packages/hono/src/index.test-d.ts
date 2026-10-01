import type { Context, Env } from "hono";
import { route as contractRoute, type } from "@rest-rpc/core";
import {
	route,
	implement,
	type RouteRequest,
	type RouteHandler,
} from "./index.ts";

describe("index types", () => {
	it("exposes native handler fields in server-first and contract-first routes", () => {
		const contract = contractRoute
			.get("/users/{id}")
			.params(type<{ id: string }>())
			.response(200, type<string>());
		const handler: RouteHandler<typeof contract> = (request) => {
			expectTypeOf(request.c).toEqualTypeOf<Context<Env>>();
			expectTypeOf(request.signal).toEqualTypeOf<AbortSignal>();
			expectTypeOf(request).toEqualTypeOf<RouteRequest<typeof contract>>();
			return { status: 200, body: request.params.id };
		};
		implement(contract).handler(handler);
		route
			.get("/users/{id}")
			.params(type<{ id: string }>())
			.response(200, type<string>())
			.handler(handler);
	});
});

describe("index environment types", () => {
	it("preserves explicit Hono bindings and variables in inferred handler types", () => {
		type AppEnv = {
			Bindings: { token: string };
			Variables: { userId: number };
		};
		const contract = contractRoute.get("/user").response(200, type<number>());
		const handler: RouteHandler<typeof contract, AppEnv> = (request) => {
			expectTypeOf(request.c.env.token).toEqualTypeOf<string>();
			expectTypeOf(request.c.get("userId")).toEqualTypeOf<number>();
			expectTypeOf(request).toEqualTypeOf<
				RouteRequest<typeof contract, AppEnv>
			>();
			return { status: 200, body: request.c.get("userId") };
		};
		void handler;
	});
});
