import { constructBaseRequest, executeRequest } from "./request.ts";

describe("request", () => {
	it("encodes path segments, repeated query values and defined headers", () => {
		const request = constructBaseRequest(
			"https://example.test",
			{ method: "GET", path: "/users/{id}/:slug" },
			{
				params: { id: "a/b", slug: "hello world" },
				query: { tags: ["a", "b"], missing: undefined, page: 0 },
				headers: { count: 0, missing: undefined },
			},
		);
		expect(request.url).toBe(
			"https://example.test/users/a%2Fb/hello%20world?tags%5B%5D=a&tags%5B%5D=b&page=0",
		);
		expect(request.headers).toEqual({ count: "0" });
	});

	it("rejects missing path parameters", () => {
		expect(() =>
			constructBaseRequest(
				"",
				{ method: "GET", path: "/users/:id" },
				undefined,
			),
		).toThrow('Missing path param "id"');
	});

	it("requires a declared content type selection for multi-format bodies", () => {
		const route = {
			method: "POST",
			path: "/",
			request: { contentType: ["application/json", "text/plain"] },
		} as const;
		expect(
			constructBaseRequest("", route, { body: "hello" }, "text/plain"),
		).toMatchObject({ body: "hello", contentType: "text/plain" });
		expect(() => constructBaseRequest("", route, { body: "hello" })).toThrow(
			"A contentType option is required",
		);
		expect(() =>
			constructBaseRequest("", route, { body: "hello" }, "image/png"),
		).toThrow("Unsupported request contentType");
	});

	it("serializes JSON and applies header precedence case-insensitively", async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 204 }));
		await executeRequest(
			{ method: "POST", path: "/users", request: { body: true } },
			[
				{ body: { name: "Ada" }, headers: { "X-Token": "request" } },
				{
					additionalHeaders: { "x-token": "additional", "X-Extra": 2 },
					cache: "no-store",
				},
			],
			{
				baseUrl: "https://example.test",
				fetch,
				globalHeaders: {
					"X-Token": async () => "global",
					omitted: () => undefined,
				},
				fetchOptions: { cache: "reload" },
			},
		);
		expect(fetch).toHaveBeenCalledWith(
			"https://example.test/users",
			expect.objectContaining({
				method: "POST",
				body: '{"name":"Ada"}',
				cache: "no-store",
				headers: {
					"x-token": "request",
					"x-extra": "2",
					"content-type": "application/json",
				},
			}),
		);
	});
});
