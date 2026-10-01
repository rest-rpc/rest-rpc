import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import {
	createOperation,
	createParameters,
	createRequestBody,
	createResponse,
} from "./operation.ts";

describe("operation", () => {
	it("combines repeated parameter constraints and unions required query keys", () => {
		const first = type<{ id: string }>();
		const second = type<{ id: string; optional?: string }>();
		const options = {
			schemaConverter: (schema: unknown) =>
				schema === first
					? { properties: { id: { type: "string" } }, required: ["id"] }
					: {
							properties: {
								id: { minLength: 1 },
								optional: { type: "string" },
							},
						},
		};
		expect(createParameters([first, second], "query", options)).toEqual([
			{
				name: "id",
				in: "query",
				required: true,
				schema: { allOf: [{ type: "string" }, { minLength: 1 }] },
			},
			{
				name: "optional",
				in: "query",
				required: false,
				schema: { type: "string" },
			},
		]);
		expect(
			createParameters(second, "path", options).map(
				(parameter) => parameter.required,
			),
		).toEqual([true, true]);
	});

	it("combines request schemas for every declared content type", () => {
		const body = createRequestBody(
			[type<string>(), type<string>()],
			() => ({ type: "string" }),
			["text/plain", "application/json"],
		);
		expect(body?.content).toEqual({
			"text/plain": {
				schema: { allOf: [{ type: "string" }, { type: "string" }] },
			},
			"application/json": {
				schema: { allOf: [{ type: "string" }, { type: "string" }] },
			},
		});
		expect(createRequestBody([], undefined)).toBeUndefined();
		expect(createRequestBody(type<string>(), undefined, [])).toBeUndefined();
	});

	it("omits content for bodyless responses and uses SSE for streams", () => {
		expect(createResponse("Deleted", { body: undefined }, undefined)).toEqual({
			description: "Deleted",
		});
		expect(
			createResponse(
				"Updates",
				{ kind: "stream", body: type<string>() },
				() => ({ type: "string" }),
			),
		).toEqual({
			description: "Updates",
			content: { "text/event-stream": { schema: { type: "string" } } },
		});
	});

	it("passes transformed parameters into the operation hook with the contract path", () => {
		const declaration = route
			.get("/users")
			.query(type<{ q: string }>())
			.response(204)["~restrpc"];
		const transformOperation = vi.fn(({ operation }) => ({
			...operation,
			operationId: "users.list",
		}));
		const operation = createOperation(
			declaration,
			{
				schemaConverter: () => ({ properties: { q: { type: "string" } } }),
				transformParameter: ({ parameter }) => ({
					...parameter,
					description: "Search",
				}),
				transformOperation,
			},
			["users", "list"],
		);
		expect(operation.parameters?.[0]?.description).toBe("Search");
		expect(operation.operationId).toBe("users.list");
		expect(transformOperation).toHaveBeenCalledWith(
			expect.objectContaining({
				route: declaration,
				routePath: ["users", "list"],
			}),
		);
	});
});
