import type { BodyCodec } from "@rest-rpc/core";

/** Default response codecs producing bodies for Node writes and Fastify replies. */
export const nodeBodyCodecs: readonly BodyCodec<unknown>[] = [
	{
		match: (mediaType) =>
			mediaType === "application/json" || mediaType.endsWith("+json"),
		serialize: (value) => {
			const json = JSON.stringify(value);
			if (json === undefined) throw new TypeError("Expected a JSON body");
			return { body: Buffer.from(json) };
		},
	},
	{
		match: (mediaType) => mediaType === "application/x-www-form-urlencoded",
		serialize: (value) => {
			if (!(value instanceof URLSearchParams))
				throw new TypeError("Expected URLSearchParams body");
			return { body: Buffer.from(value.toString()) };
		},
	},
	{
		match: (mediaType) => mediaType.startsWith("text/"),
		serialize: (value) => {
			if (typeof value !== "string")
				throw new TypeError("Expected string body");
			return { body: Buffer.from(value) };
		},
	},
	{
		match: () => true,
		serialize: async (value) => ({
			body:
				value instanceof Blob ? Buffer.from(await value.arrayBuffer()) : value,
		}),
	},
];
