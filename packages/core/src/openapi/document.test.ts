import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import { createOpenApiDocument } from "./document.ts";

describe("document", () => {
	it("normalizes explicit paths and derives paths from nested contract keys", () => {
		const contract = {
			users: {
				get: route.get("/users/:id").response(200, type<string>()),
				remove: route.delete("/users/{id}").response(204),
				create: route.input(type<string>()).output(type<string>()),
			},
		};
		const document = createOpenApiDocument(contract, {
			info: { title: "Users", version: "1" },
		});
		expect(Object.keys(document.paths)).toEqual([
			"/users/{id}",
			"/users/create",
		]);
		expect(Object.keys(document.paths["/users/{id}"]!)).toEqual([
			"get",
			"delete",
		]);
		expect(document.paths["/users/create"]?.post?.requestBody?.content).toEqual(
			{ "application/json": { schema: {} } },
		);
	});
});
