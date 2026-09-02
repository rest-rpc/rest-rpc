import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { validateWebSocketMessageSync } from "./websocketMessages.ts";

describe("validateWebSocketMessageSync", () => {
	it("rejects inherited object properties as message discriminators", () => {
		const result = validateWebSocketMessageSync(
			{
				send: z.object({ text: z.string() }),
			},
			{
				type: "constructor",
				message: {},
			},
		);

		assert.deepEqual(result, {
			issues: [{ message: "Unknown WebSocket message discriminator." }],
		});
	});
});
