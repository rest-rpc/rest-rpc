import { defaultBodyCodecs } from "./defaults.ts";
import type {
	BodyCodec,
	BodyDeserializer,
	BodySerializer,
	SerializedBody,
} from "./types.ts";

/** Extracts the lowercase base media type without header parameters. */
export function normalizeMediaType(contentType: string): string {
	return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** Selects the first matching serializer, skipping rules without that operation. */
export function resolveBodySerializer<TSource>(
	mediaType: string,
	codecs: readonly BodyCodec<TSource>[],
	defaults: readonly BodyCodec<TSource>[] = [],
): BodySerializer | undefined {
	for (const rules of [codecs, defaults]) {
		for (const rule of rules) {
			if (rule.serialize && rule.match(mediaType)) return rule.serialize;
		}
	}
	return undefined;
}

/** Selects a native deserializer without consuming or adapting its source. */
export function resolveBodyDeserializer<TSource>(
	mediaType: string,
	codecs: readonly BodyCodec<TSource>[],
	defaults: readonly BodyCodec<TSource>[] = [],
): BodyDeserializer<TSource> | undefined {
	if (!mediaType) return undefined;
	for (const rules of [codecs, defaults]) {
		for (const rule of rules) {
			if (rule.deserialize && rule.match(mediaType)) return rule.deserialize;
		}
	}
	return undefined;
}

/** Serializes a present outgoing value with user rules followed by Fetch defaults. */
export async function serializeBody<TSource>(
	value: unknown,
	declaredContentType: string,
	codecs: readonly BodyCodec<TSource>[] = [],
): Promise<SerializedBody> {
	const mediaType = normalizeMediaType(declaredContentType);
	const serialize =
		resolveBodySerializer(mediaType, codecs) ??
		resolveBodySerializer(mediaType, defaultBodyCodecs);
	if (!serialize) throw new Error("No serializer for declared content-type");
	const result = await serialize(value, declaredContentType);
	for (const name of Object.keys(result.headers ?? {})) {
		if (
			["content-type", "content-length", "transfer-encoding"].includes(
				name.toLowerCase(),
			)
		) {
			throw new Error(`Codec headers must not contain "${name}"`);
		}
	}
	if (
		typeof result.contentType === "string" &&
		normalizeMediaType(result.contentType) !== mediaType
	) {
		throw new Error(
			"Codec content-type must retain the declared base media type",
		);
	}
	return {
		...result,
		contentType:
			result.contentType === undefined
				? declaredContentType
				: result.contentType,
	};
}

/** Parses a Fetch source; missing media types and absent bodies bypass codec matching. */
export async function deserializeBody<TSource extends Request | Response>(
	source: TSource,
	codecs: readonly BodyCodec<TSource>[] = [],
): Promise<unknown> {
	const mediaType = normalizeMediaType(
		source.headers.get("content-type") ?? "",
	);
	if (!mediaType || source.body === null) return undefined;
	const deserialize =
		resolveBodyDeserializer(mediaType, codecs) ??
		resolveBodyDeserializer(mediaType, defaultBodyCodecs);
	return deserialize ? deserialize(source) : undefined;
}
