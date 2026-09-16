import type { BodyCodec } from "@rest-rpc/core";
import {
	type RuntimeImplementationTree,
	flattenRouteImplementations,
} from "@rest-rpc/server";
import type { Hono, HonoRequest } from "hono";
import type { Env } from "hono/types";
import {
	type ExtendedHonoMiddleware,
	type RequestValidationErrorHandler,
	type ResponseValidationErrorHandler,
	registerHonoHttpRoutes,
} from "./http.ts";

/**
 * Options for registering rest-rpc routes on a Hono app.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#options}
 */
export type RegisterRoutesOptions<TEnv extends Env = Env> = {
	requestValidationErrorHandler?: RequestValidationErrorHandler<TEnv>;
	responseValidationErrorHandler?: ResponseValidationErrorHandler<TEnv>;
	middleware?: ExtendedHonoMiddleware<TEnv>[];
	bodyCodecs?: readonly BodyCodec<HonoRequest>[];
	requestBody?: { maxBytes?: number };
};

/**
 * Registers HTTP route implementations on a Hono app.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono}
 */
export function registerRoutes<TEnv extends Env = Env>(
	app: Hono<TEnv>,
	implementations: RuntimeImplementationTree,
	options: RegisterRoutesOptions<TEnv> = {},
) {
	const maxBytes = options.requestBody?.maxBytes;
	if (
		maxBytes !== undefined &&
		(!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
	) {
		throw new Error("requestBody.maxBytes must be a positive safe integer");
	}
	if (
		maxBytes !== undefined &&
		options.bodyCodecs?.some((codec) => codec.deserialize !== undefined)
	) {
		throw new Error(
			"requestBody.maxBytes cannot be combined with a custom deserializer",
		);
	}

	return registerHonoHttpRoutes(
		app,
		flattenRouteImplementations(implementations),
		options,
	);
}
