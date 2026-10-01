import { type } from "../standard-schema/type.ts";
import { parseSseStream } from "./stream.ts";

const stream = (...chunks: string[]) =>
	new ReadableStream<Uint8Array<ArrayBuffer>>({
		start(controller) {
			for (const chunk of chunks)
				controller.enqueue(new TextEncoder().encode(chunk));
			controller.close();
		},
	});
const collect = async (events: AsyncIterable<unknown>) => {
	const result = [];
	for await (const event of events) result.push(event);
	return result;
};

describe("stream", () => {
	it("buffers split frames, parses event metadata and maps validated data", async () => {
		const events = parseSseStream(
			type((value: number) => value + 1),
			stream(
				"id: one\nevent: update\nretry: 100\ndata: ",
				"1\n",
				"\ndata: 2\n\n",
			),
			true,
		);
		expect(await collect(events)).toEqual([
			{ id: "one", event: "update", retry: 100, data: 2 },
			{ data: 3 },
		]);
	});

	it("rejects frames without data", async () => {
		await expect(
			collect(parseSseStream(undefined, stream("id: one\n\n"), false)),
		).rejects.toThrow("SSE frame has no data field.");
	});

	it("rejects an unterminated final frame", async () => {
		await expect(
			collect(parseSseStream(undefined, stream("data: 1\n"), false)),
		).rejects.toThrow("Incomplete SSE frame.");
	});
});
