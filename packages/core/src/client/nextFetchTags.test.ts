import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { router } from "../contract/define.ts";
import { noBody } from "../contract/route.ts";
import { type } from "../standard-schema/type.ts";
import { getNextFetchTags } from "./nextFetchTags.ts";

describe("Next fetch tags", () => {
	it("generates exact and route-level tags from the route cache key and request", () => {
		const apiContract = router({
			items: {
				list: {
					method: "GET",
					path: "/items/:id",
					request: {
						body: {
							ignoredBody: type<string>(),
						},
						headers: {
							authorization: type<string>(),
						},
						params: { id: type<string>() },
						query: {
							filter: type<string>(),
							page: type<number>(),
						},
						requestKeys: {
							id: "params",
							filter: "query",
							page: "query",
							authorization: "headers",
							ignoredBody: "body",
						},
					},
					responses: {
						204: noBody(),
					},
				},
			},
		});

		assert.deepEqual(
			getNextFetchTags(apiContract.items.list, {
				id: "one/two",
				filter: "open",
				page: 2,
				authorization: "Bearer secret",
				ignoredBody: "ignored",
			}),
			[
				"rest-rpc:items.list:filter:open:id:one%2Ftwo:page:2",
				"rest-rpc:items.list",
			],
		);
		assert.deepEqual(getNextFetchTags(apiContract.items.list), [
			"rest-rpc:items.list",
		]);
	});

	it("uses a custom prefix and de-dupes routes without query params", () => {
		const apiContract = router({
			items: {
				get: {
					method: "GET",
					path: "/items/:id",
					request: {
						params: { id: type<string>() },
						requestKeys: {
							id: "params",
						},
					},
					responses: {
						204: noBody(),
					},
				},
			},
		});

		assert.deepEqual(
			getNextFetchTags(
				apiContract.items.get,
				{ id: "one" },
				{ tagPrefix: "api" },
			),
			["api:items.get:id:one", "api:items.get"],
		);
	});
});
