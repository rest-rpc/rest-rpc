import z from "zod";

export const upstreamContract = {
	counter: {
		get: {
			method: "GET",
			path: "/counter/:id",
			request: {
				pathParams: z.object({ id: z.string() }),
			},
			responses: {
				200: z.object({
					id: z.string(),
					count: z.number(),
				}),
			},
		},
	},
} as const;
