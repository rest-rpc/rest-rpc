import type { BodyCodec } from "@rest-rpc/core";
import { normalizeMediaType, resolveBodyCodec } from "@rest-rpc/core/codecs";
import { nodeBodyCodecs } from "@rest-rpc/node";
import { StreamableFile } from "@nestjs/common";
import { Readable } from "node:stream";

// Nest owns JSON serialization. Other defaults prepare native response values.
export const nestBodyCodecs: readonly BodyCodec<unknown>[] = [
	{
		match: (mediaType) =>
			mediaType === "application/json" || mediaType.endsWith("+json"),
		serialize: (value) => ({ body: value }),
	},
	{
		match: () => true,
		serialize: async (value, contentType) => {
			const codec = resolveBodyCodec(
				normalizeMediaType(contentType),
				nodeBodyCodecs,
			);
			const serialized = await codec!.serialize!(value, contentType);
			const body = serialized.body;
			return {
				...serialized,
				body:
					body instanceof Uint8Array
						? new StreamableFile(body, { type: contentType })
						: body instanceof Readable
							? new StreamableFile(body, { type: contentType })
							: body,
			};
		},
	},
];
