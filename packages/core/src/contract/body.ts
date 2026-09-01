import {
	isStandardSchema,
	type StandardSchemaV1,
} from "../standard-schema/index.ts";
import { resolveBuiltInRequestKeys } from "./requestKeys.ts";

type BodyScalar = string | number | boolean;

/** A form body schema whose input can be serialized as URL-encoded fields. */
export type FormBodySchema = StandardSchemaV1<
	Record<string, BodyScalar | readonly BodyScalar[] | undefined>,
	unknown
>;

type MultipartBodyValue = BodyScalar | Blob;

/** A multipart body schema whose input can be serialized as form-data fields. */
export type MultipartBodySchema = StandardSchemaV1<
	Record<
		string,
		MultipartBodyValue | readonly MultipartBodyValue[] | undefined
	>,
	unknown
>;

type BodyWithArrayKeysSchema = FormBodySchema | MultipartBodySchema;

/**
 * Marks a request or response body as intentionally empty.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-without-body}
 */
export type NoBody = {
	kind: "noBody";
};

/**
 * Declares an `application/x-www-form-urlencoded` request body.
 */
export type FormBody<
	TSchema extends FormBodySchema = FormBodySchema,
	TArrayKeys extends readonly string[] = readonly string[],
> = {
	kind: "formBody";
	schema: TSchema;
	arrayKeys: TArrayKeys;
};

/**
 * Declares a `multipart/form-data` request body.
 */
export type MultipartBody<
	TSchema extends MultipartBodySchema = MultipartBodySchema,
	TArrayKeys extends readonly string[] = readonly string[],
> = {
	kind: "multipartBody";
	schema: TSchema;
	arrayKeys: TArrayKeys;
};

/**
 * Declares one or more non-JSON media types for a custom body.
 */
export type CustomBodyContentType = string | readonly string[];

export type BodyWithArrayKeysOptions<
	TSchema extends BodyWithArrayKeysSchema = BodyWithArrayKeysSchema,
	TArrayKeys extends readonly string[] = readonly string[],
> = {
	schema: TSchema;
	arrayKeys: TArrayKeys;
};

export type BodyWithArrayKeysInput<
	TSchema extends BodyWithArrayKeysSchema = BodyWithArrayKeysSchema,
	TArrayKeys extends readonly string[] = readonly string[],
> = TSchema | BodyWithArrayKeysOptions<TSchema, TArrayKeys>;

export function resolveBodyWithArrayKeys<
	const TSchema extends BodyWithArrayKeysSchema,
	const TArrayKeys extends readonly string[] = readonly string[],
>(
	input: BodyWithArrayKeysInput<TSchema, TArrayKeys>,
): {
	schema: TSchema;
	arrayKeys: readonly string[];
} {
	if (!isStandardSchema(input)) {
		return input;
	}

	return {
		schema: input,
		arrayKeys: Object.entries(resolveBuiltInRequestKeys(input) ?? {})
			.filter(([, isArray]) => isArray)
			.map(([key]) => key),
	};
}

/**
 * Declares that a request or response has no body.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-without-body}
 */
export function noBody(): NoBody {
	return {
		kind: "noBody",
	};
}

/**
 * Declares an `application/x-www-form-urlencoded` request body.
 *
 * @remarks The generated client serializes the typed body object to
 * `URLSearchParams` and lets `fetch()` set the content-type header. Server
 * body parsers should pass a `URLSearchParams` instance to rest-rpc. Each
 * scalar form key is validated as a string, or `undefined` when omitted. Form
 * array keys are encoded and decoded as repeated form keys.
 *
 * @see {@link https://rest-rpc.dev/docs/http-requests#request-with-form-body}
 */
export function formBody<const TSchema extends FormBodySchema>(
	schema: TSchema,
): FormBody<TSchema>;
export function formBody<
	const TSchema extends FormBodySchema,
	const TArrayKeys extends readonly string[],
>(
	input: BodyWithArrayKeysOptions<TSchema, TArrayKeys>,
): FormBody<TSchema, TArrayKeys>;
export function formBody<
	const TSchema extends FormBodySchema,
	const TArrayKeys extends readonly string[],
>(input: BodyWithArrayKeysInput<TSchema, TArrayKeys>): FormBody<TSchema> {
	const { schema, arrayKeys } = resolveBodyWithArrayKeys(input);

	return {
		kind: "formBody",
		schema,
		arrayKeys,
	} as FormBody<TSchema>;
}

/**
 * Declares a `multipart/form-data` request body.
 *
 * @remarks The generated client serializes the typed body object to
 * `FormData` and lets `fetch()` set the content-type header, including the
 * boundary. Server body parsers should pass a `FormData` instance to rest-rpc.
 * Each scalar multipart key is validated as a string or `File`, or
 * `undefined` when omitted. Multipart array keys are encoded and decoded as
 * repeated form keys.
 *
 * @see {@link https://rest-rpc.dev/docs/http-requests#request-with-multipart-body}
 */
export function multipartBody<const TSchema extends MultipartBodySchema>(
	schema: TSchema,
): MultipartBody<TSchema>;
export function multipartBody<
	const TSchema extends MultipartBodySchema,
	const TArrayKeys extends readonly string[],
>(
	input: BodyWithArrayKeysOptions<TSchema, TArrayKeys>,
): MultipartBody<TSchema, TArrayKeys>;
export function multipartBody<
	const TSchema extends MultipartBodySchema,
	const TArrayKeys extends readonly string[],
>(input: BodyWithArrayKeysInput<TSchema, TArrayKeys>): MultipartBody<TSchema> {
	const { schema, arrayKeys } = resolveBodyWithArrayKeys(input);

	return {
		kind: "multipartBody",
		schema,
		arrayKeys,
	} as MultipartBody<TSchema>;
}

/**
 * Declares a body schema with one or more non-JSON content types.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-with-custom-content-type}
 */
export type CustomBody<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TContentType extends CustomBodyContentType | undefined =
		| CustomBodyContentType
		| undefined,
> = {
	kind: "customBody";
	schema: TSchema;
} & ([TContentType] extends [CustomBodyContentType]
	? { contentType: TContentType }
	: { contentType?: Exclude<TContentType, undefined> });

/**
 * A custom body declaration that is valid for responses.
 */
export type CustomResponseBody<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TContentType extends CustomBodyContentType = CustomBodyContentType,
> = {
	kind: "customBody";
	schema: TSchema;
	contentType: TContentType;
};

export type CustomResponseInput<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TContentType extends CustomBodyContentType = CustomBodyContentType,
> = {
	schema: TSchema;
	contentType: TContentType;
};

export type CustomBodyInput<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TContentType extends CustomBodyContentType = CustomBodyContentType,
> = TSchema | CustomResponseInput<TSchema, TContentType>;

/**
 * Declares a streaming response body.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#streaming-ndjson-responses}
 */
export type Stream<
	TBody extends StandardSchemaV1 | CustomResponseBody =
		| StandardSchemaV1
		| CustomResponseBody,
> = {
	kind: "stream";
	schema: TBody;
};

/**
 * Declares a streaming response body.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#streaming-ndjson-responses}
 */
export function stream<
	const TBody extends StandardSchemaV1 | CustomResponseBody,
>(schema: TBody): Stream<TBody> {
	return {
		kind: "stream",
		schema,
	};
}

/**
 * Declares a body schema with one or more non-JSON content types.
 *
 * @remarks Pass a schema directly when the generated client should pass the
 * request body to `fetch()` and let the runtime set the content-type header.
 * Response bodies must use the object form and declare `contentType` because
 * the server adapter needs a concrete media type to send.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-with-custom-content-type}
 */
export function customBody<const TSchema extends StandardSchemaV1>(
	schema: TSchema,
): CustomBody<TSchema, undefined>;
export function customBody<
	const TSchema extends StandardSchemaV1,
	const TContentType extends CustomBodyContentType,
>(
	input: CustomResponseInput<TSchema, TContentType>,
): CustomBody<TSchema, TContentType>;
export function customBody<const TSchema extends StandardSchemaV1>(
	input: CustomBodyInput<TSchema>,
): CustomBody<TSchema, CustomBodyContentType | undefined> {
	const schema = "~standard" in input ? input : input.schema;
	const contentType = "~standard" in input ? undefined : input.contentType;

	return {
		kind: "customBody",
		schema,
		contentType,
	} as CustomBody<TSchema, CustomBodyContentType | undefined>;
}

export function isNoBody(body: unknown): body is NoBody {
	return (
		typeof body === "object" &&
		body !== null &&
		"kind" in body &&
		body.kind === "noBody"
	);
}

export function isFormBody(body: unknown): body is FormBody {
	return (
		typeof body === "object" &&
		body !== null &&
		"kind" in body &&
		body.kind === "formBody"
	);
}

export function isMultipartBody(body: unknown): body is MultipartBody {
	return (
		typeof body === "object" &&
		body !== null &&
		"kind" in body &&
		body.kind === "multipartBody"
	);
}

export function isStream(response: unknown): response is Stream {
	return (
		typeof response === "object" &&
		response !== null &&
		"kind" in response &&
		response.kind === "stream"
	);
}

export function isCustomBody(schema: unknown): schema is CustomBody {
	return (
		typeof schema === "object" &&
		schema !== null &&
		"kind" in schema &&
		schema.kind === "customBody"
	);
}
