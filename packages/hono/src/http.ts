import { createFetchResponse } from "@rest-rpc/fetch";
import { deserializeRequestBody } from "@rest-rpc/fetch/deserializeRequestBody";
import type { RegisterRoutesOptions } from "./registerRoutes.ts";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	assertRequestContentType,
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";
import type { Context, Hono, Next } from "hono";
import type { Env } from "hono/types";

/**
 * Defines the response returned when a request fails validation in Hono.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#error-handling}
 */
export type RequestValidationErrorHandler<TEnv extends Env = Env> = (
	error: RequestValidationError,
	c: Context<TEnv>,
) => Response | Promise<Response>;

/**
 * Defines the response returned when handler output fails validation in Hono.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#error-handling}
 */
export type ResponseValidationErrorHandler<TEnv extends Env = Env> = (
	error: ResponseValidationError,
	c: Context<TEnv>,
) => Response | Promise<Response>;

/**
 * Hono middleware that also receives the matched rest-rpc route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#middleware}
 */
export type ExtendedHonoMiddleware<TEnv extends Env = Env> = (
	c: Context<TEnv>,
	next: Next,
	route: RouteDeclaration,
	// oxlint-disable-next-line typescript/no-explicit-any -- Hono itself accepts `any` for handler return type.
) => Promise<any> | any;

export const registerHonoHttpRoutes = <TEnv extends Env = Env>(
	app: Hono<TEnv>,
	routes: ReturnType<
		typeof import("@rest-rpc/server").flattenRouteImplementations
	>,
	options: RegisterRoutesOptions<TEnv> = {},
) => {
	const {
		bodyCodecs = [],
		middleware = [],
		requestValidationErrorHandler,
		responseValidationErrorHandler,
	} = options;

	for (const implementation of routes) {
		const route = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<
			RouteDeclaration["method"]
		>;

		app[method](
			// oxlint-disable-next-line typescript/no-explicit-any -- Hono's typings are too strict for this case.
			toColonPath(route.path) as any,
			...middleware.map(
				(mw) => (c: Context<TEnv>, next: Next) => mw(c, next, route),
			),
			async (c: Context<TEnv>) => {
				const rejection = assertRequestContentType(
					route,
					c.req.header("content-type"),
				);
				if (rejection) {
					return c.json({ message: rejection.message }, rejection.status);
				}

				const { body, rejection: bodyRejection } = await deserializeRequestBody(
					c.req,
					c.req.raw,
					bodyCodecs,
					options.requestBody?.maxBytes,
				);
				if (bodyRejection) {
					return c.json(
						{ message: bodyRejection.message },
						bodyRejection.status,
					);
				}

				const result = await handleHttpRoute(implementation, {
					request: {
						body,
						query: new URL(c.req.raw.url).searchParams,
						params: c.req.param(),
						headers: c.req.header(),
					},
					context: {},
					handlerFields: { c, signal: c.req.raw.signal },
				});

				if (result instanceof RequestValidationError) {
					if (requestValidationErrorHandler) {
						return requestValidationErrorHandler(result, c);
					}

					return c.json(result.responseBody, result.status);
				}

				if (result instanceof ResponseValidationError) {
					if (responseValidationErrorHandler) {
						return responseValidationErrorHandler(result, c);
					}

					return c.json(result.responseBody, result.status);
				}

				return createFetchResponse(result);
			},
		);
	}
};
