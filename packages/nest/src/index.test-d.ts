import type { ExecutionContext } from "@nestjs/common";
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
			expectTypeOf(request.executionContext).toEqualTypeOf<ExecutionContext>();
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
