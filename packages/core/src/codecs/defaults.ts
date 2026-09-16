import type { BodyCodec } from "./types.ts";

const bufferedResponse = async (source: Request | Response) => {
	const bytes = await source.arrayBuffer();
	return bytes.byteLength === 0
		? undefined
		: new Response(bytes, { headers: source.headers });
};

/** Fetch-compatible built-in codecs, ordered from specific formats to binary fallback. */
export const defaultBodyCodecs: readonly BodyCodec<Request | Response>[] = [
	{
		match: (mediaType) =>
			mediaType === "application/json" || mediaType.endsWith("+json"),
		serialize: (value) => {
			const body = JSON.stringify(value);
			if (body === undefined) throw new TypeError("Expected a JSON body");
			return { body };
		},
		deserialize: async (source) => (await bufferedResponse(source))?.json(),
	},
	{
		match: (mediaType) => mediaType === "application/x-www-form-urlencoded",
		serialize: (value) => {
			if (!(value instanceof URLSearchParams))
				throw new TypeError("Expected URLSearchParams body");
			return { body: value };
		},
		deserialize: async (source) => {
			const response = await bufferedResponse(source);
			return response ? new URLSearchParams(await response.text()) : undefined;
		},
	},
	{
		match: (mediaType) => mediaType === "multipart/form-data",
		serialize: (value) => {
			if (!(value instanceof FormData))
				throw new TypeError("Expected FormData body");
			return { body: value, contentType: null };
		},
		deserialize: async (source) => (await bufferedResponse(source))?.formData(),
	},
	{
		match: (mediaType) => mediaType.startsWith("text/"),
		serialize: (value) => {
			if (typeof value !== "string")
				throw new TypeError("Expected string body");
			return { body: value };
		},
		deserialize: async (source) => (await bufferedResponse(source))?.text(),
	},
	{
		match: () => true,
		serialize: (value) => {
			if (!(value instanceof Blob)) throw new TypeError("Expected Blob body");
			return { body: value };
		},
		deserialize: async (source) => (await bufferedResponse(source))?.blob(),
	},
];
