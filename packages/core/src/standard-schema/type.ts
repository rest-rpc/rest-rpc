import type { StandardSchemaV1 } from "./index.ts";

const UNCHECKED_SCHEMA_VENDOR = "rest-rpc";

/**
 * Creates an unchecked Standard Schema for compile-time contracts and optional
 * synchronous output mapping.
 *
 * @remarks Runtime validation asserts the value to be `TInput` without
 * checking it. When provided, the mapper transforms that asserted value and
 * any exception it throws propagates to the caller. Use this helper only when
 * runtime validation is not needed.
 *
 * @see {@link https://rest-rpc.dev/docs/http-behavior/schemas}
 */
export function type<TInput>(
	map?: (input: TInput) => TInput,
): StandardSchemaV1<TInput, TInput>;
export function type<TInput, TOutput>(
	map: (input: TInput) => TOutput,
): StandardSchemaV1<TInput, TOutput>;
export function type<TInput, TOutput = TInput>(
	map?: (input: TInput) => TOutput,
): StandardSchemaV1<TInput, TOutput> {
	return {
		"~standard": {
			version: 1,
			vendor: UNCHECKED_SCHEMA_VENDOR,
			validate: (value) => {
				const input = value as TInput;
				return {
					value: map === undefined ? (input as unknown as TOutput) : map(input),
				};
			},
		},
	};
}
