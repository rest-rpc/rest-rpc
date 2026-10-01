import { route, type, type SseEvent } from "@rest-rpc/core";
import { QueryClient, skipToken } from "@tanstack/query-core";
import {
	createTanstackQueryUtils,
	type RouteQueryData,
	type RouteMutationVariables,
	type RouteStreamedQueryData,
} from "./createTanstackQueryUtils.ts";

const get = route
	.get("/users/{id}")
	.params(type<{ id: string }>())
	.response(200, type<{ name: string }>())
	.response(404, type<{ message: string }>());
const empty = route.get("/health").response(204);
const events = route
	.get("/events")
	.streamResponse(200, type<{ value: number }>());
const utils = createTanstackQueryUtils(
	{ get, empty, events },
	{ baseUrl: "https://example.test" },
);

describe("createTanstackQueryUtils types", () => {
	it("requires requests only for routes with input and preserves success data in tagged keys", () => {
		const options = utils.get.queryOptions({
			request: { params: { id: "1" } },
		});
		utils.get.queryOptions({ request: skipToken });
		utils.empty.queryOptions();
		// @ts-expect-error Required params cannot be omitted.
		utils.get.queryOptions();
		// @ts-expect-error The id is a string.
		utils.get.queryOptions({ request: { params: { id: 1 } } });
		expectTypeOf<RouteQueryData<typeof get>["status"]>().toEqualTypeOf<200>();
		expectTypeOf(
			new QueryClient().getQueryData(options.queryKey),
		).toEqualTypeOf<RouteQueryData<typeof get> | undefined>();
		expectTypeOf<
			RouteMutationVariables<typeof empty>
		>().toEqualTypeOf<undefined>();
	});

	it("infers selected data and infinite page request parameters", () => {
		utils.get.queryOptions({
			request: { params: { id: "1" } },
			select: (response) => {
				expectTypeOf(response.body).toEqualTypeOf<{ name: string }>();
				return response.body.name;
			},
		});
		utils.get.infiniteQueryOptions({
			initialPageParam: 0,
			request: (page) => {
				expectTypeOf(page).toEqualTypeOf<number>();
				return { params: { id: String(page) } };
			},
			getNextPageParam: () => undefined,
		});
	});

	it("exposes streaming options only for streams and infers reducer chunks", () => {
		expectTypeOf<RouteStreamedQueryData<typeof events>>().toEqualTypeOf<
			Array<SseEvent<{ value: number }>>
		>();
		utils.events.streamedQueryOptions({
			initialValue: 0,
			reducer: (total, chunk) => {
				expectTypeOf(total).toEqualTypeOf<number>();
				expectTypeOf(chunk).toEqualTypeOf<SseEvent<{ value: number }>>();
				return total + chunk.data.value;
			},
		});
		// @ts-expect-error Non-stream routes have no streaming options.
		utils.get.streamedQueryOptions();
		// @ts-expect-error A reducer requires an initial value.
		utils.events.streamedQueryOptions({ reducer: (total: number) => total });
	});
});
