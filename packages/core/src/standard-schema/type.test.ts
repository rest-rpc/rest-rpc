import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type as schemaType } from "./type.ts";

describe("type", () => {
	it("returns an input value unchanged without a mapper", () => {
		const schema = schemaType<{ id: string }>();
		const input = { id: "todo-1" };

		assert.deepEqual(schema["~standard"].validate(input), { value: input });
	});

	it("maps the asserted input value synchronously", () => {
		const inputs: number[] = [];
		const schema = schemaType<number, string>((input) => {
			inputs.push(input);
			return input.toString();
		});

		assert.deepEqual(schema["~standard"].validate(42), { value: "42" });
		assert.deepEqual(inputs, [42]);
	});

	it("propagates mapper exceptions", () => {
		const schema = schemaType<number>(() => {
			throw new Error("mapping failed");
		});

		assert.throws(() => schema["~standard"].validate(42), /mapping failed/);
	});
});
