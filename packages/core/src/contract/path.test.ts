import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	getPathParamNames,
	getparamsegmentName,
	isparamsegment,
	replaceparams,
	toColonPath,
	toOpenApiPath,
} from "./path.ts";

describe("path helpers", () => {
	it("extracts path params from supported marker styles", () => {
		assert.deepEqual(getPathParamNames("/orgs/:orgId/todos/{todo_id}"), [
			"orgId",
			"todo_id",
		]);
		assert.deepEqual(getPathParamNames("/orgs/org-{orgId}/todos/{todo_id}"), [
			"todo_id",
		]);
	});

	it("recognizes full dynamic path segments", () => {
		assert.equal(getparamsegmentName(":id"), "id");
		assert.equal(getparamsegmentName("{id}"), "id");
		assert.equal(getparamsegmentName("todos-{id}"), undefined);
		assert.equal(isparamsegment(":id"), true);
		assert.equal(isparamsegment("{id}"), true);
		assert.equal(isparamsegment("todos"), false);
	});

	it("normalizes path params for external route formats", () => {
		assert.equal(
			toOpenApiPath("/orgs/:orgId/todos/{todo_id}"),
			"/orgs/{orgId}/todos/{todo_id}",
		);
		assert.equal(
			toColonPath("/orgs/:orgId/todos/{todo_id}"),
			"/orgs/:orgId/todos/:todo_id",
		);
	});

	it("replaces path params without exposing marker syntax to callers", () => {
		assert.equal(
			replaceparams("/orgs/:orgId/todos/{todo_id}", (name) =>
				name.toUpperCase(),
			),
			"/orgs/ORGID/todos/TODO_ID",
		);
	});
});
