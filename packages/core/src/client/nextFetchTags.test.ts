import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route } from "../routebuilder/index.ts";
import { type } from "../standard-schema/type.ts";
import { getNextFetchTags } from "./nextFetchTags.ts";

describe("Next fetch tags", () => {
	it("generates exact and route-level tags from the route path and request", () => {
		const apiContract = {
			items: {
				list: route
					.get("/items/:id")
					.body(type<{ ignoredBody: string }>())
					.headers({
						authorization: type<string>(),
					})
					.pathParams(type<{ id: string }>())
					.query(type<{ filter: string; page: number }>())
					.requestKeys({
						id: "pathParams",
						filter: "query",
						page: "query",
						authorization: "headers",
						ignoredBody: "body",
					})
					.response(204),
			},
		};

		assert.deepEqual(
			getNextFetchTags(
				apiContract.items.list,
				["items", "list"],
				{
					id: "one/two",
					filter: "open",
					page: 2,
					authorization: "Bearer secret",
					ignoredBody: "ignored",
				},
			),
			[
				"rest-rpc:items.list:filter:open:id:one%2Ftwo:page:2",
				"rest-rpc:items.list",
			],
		);
		assert.deepEqual(
			getNextFetchTags(apiContract.items.list, ["items", "list"]),
			["rest-rpc:items.list"],
		);
	});

	it("uses a custom prefix and de-dupes routes without query params", () => {
		const apiContract = {
			items: {
				get: route
					.get("/items/:id")
					.pathParams(type<{ id: string }>())
					.requestKeys({
						id: "pathParams",
					})
					.response(204),
			},
		};

		assert.deepEqual(
			getNextFetchTags(
				apiContract.items.get,
				["items", "get"],
				{ id: "one" },
				{ tagPrefix: "api" },
			),
			["api:items.get:id:one", "api:items.get"],
		);
	});

	it("uses grouped request segments when flattened request keys are disabled", () => {
		const groupedRoute = route.with({ flattenRequestKeys: false });
		const apiContract = {
			items: {
				list: groupedRoute
					.get("/items/:id")
					.pathParams(type<{ id: string }>())
					.query(type<{ filter: string }>())
					.response(204),
			},
		};

		assert.deepEqual(
			getNextFetchTags(
				apiContract.items.list,
				["items", "list"],
				{
					pathParams: { id: "one", unused: undefined },
					query: { filter: "open" },
				},
			),
			[
				"rest-rpc:items.list:pathParams:%7B%22id%22%3A%22one%22%7D:query:%7B%22filter%22%3A%22open%22%7D",
				"rest-rpc:items.list",
			],
		);
	});

	it("serializes JSON query values in grouped request segments", () => {
		const groupedRoute = route.with({ flattenRequestKeys: false });
		const apiContract = {
			items: {
				list: groupedRoute
					.get("/items")
					.jsonQuery(type<{ page: number; filters: { tag: string } }>())
					.response(204),
			},
		};

		assert.deepEqual(
			getNextFetchTags(
				apiContract.items.list,
				["items", "list"],
				{
					query: {
						page: 2,
						filters: { tag: "open" },
					},
				},
			),
			[
				"rest-rpc:items.list:query:%7B%22filters%22%3A%7B%22tag%22%3A%22open%22%7D%2C%22page%22%3A2%7D",
				"rest-rpc:items.list",
			],
		);
	});
});
