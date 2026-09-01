import {
	type StandardSchemaV1,
	validateStandardSchemaSync,
} from "../standard-schema/index.ts";

/**
 * Maps WebSocket message discriminator values to their schemas.
 *
 * @see {@link https://rest-rpc.dev/docs/websockets#contract}
 */
export type WebSocketMessageSchemas = Record<string, StandardSchemaV1>;

const messageIssue = (message: string): StandardSchemaV1.FailureResult => ({
	issues: [{ message }],
});

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
	typeof value === "object" && value !== null;

export const validateWebSocketMessageSync = (
	declaration: WebSocketMessageSchemas,
	value: unknown,
): StandardSchemaV1.Result<unknown> => {
	if (!isRecord(value)) {
		return messageIssue("Expected WebSocket message envelope.");
	}

	const discriminatorValue = value.type;
	if (typeof discriminatorValue !== "string") {
		return messageIssue("Expected WebSocket message discriminator.");
	}

	const schema = declaration[discriminatorValue];
	if (!schema) {
		return messageIssue("Unknown WebSocket message discriminator.");
	}

	const result = validateStandardSchemaSync(schema, value.message);
	if (result.issues) return result;

	return {
		value: {
			type: discriminatorValue,
			message: result.value,
		},
	};
};
