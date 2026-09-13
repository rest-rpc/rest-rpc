import type { StandardSchemaV1 } from "../standard-schema/index.ts";

/** A commonly supported request or response body media type. */
export type KnownBodyContentType =
	| "application/json"
	| "application/octet-stream"
	| "application/x-www-form-urlencoded"
	| "multipart/form-data"
	| "text/plain";

/** Declares one or more media types for a request or response body. */
export type BodyContentType =
	| KnownBodyContentType
	| (string & Record<never, never>)
	| readonly (KnownBodyContentType | (string & Record<never, never>))[];

/**
 * Declares a streaming response body.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#streaming-ndjson-responses}
 */
export type Stream<TBody extends StandardSchemaV1 = StandardSchemaV1> = {
	kind: "stream";
	schema: TBody;
};

export function isStream(response: unknown): response is Stream {
	return (
		typeof response === "object" &&
		response !== null &&
		"kind" in response &&
		response.kind === "stream"
	);
}
