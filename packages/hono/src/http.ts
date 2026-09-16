import { createFetchResponse, defaultBodyParser } from "@rest-rpc/fetch";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	assertRequestContentType,
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";
import type { Context, Hono, HonoRequest, Next } from "hono";
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
 * Custom Hono request body parser used during route registration.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#body-parsing}
 */
export type HonoBodyParser = (
	request: HonoRequest,
) => unknown | Promise<unknown>;

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
	bodyParser: HonoBodyParser | undefined = undefined,
	middleware: ExtendedHonoMiddleware<TEnv>[] = [],
	requestValidationErrorHandler?: RequestValidationErrorHandler<TEnv>,
	responseValidationErrorHandler?: ResponseValidationErrorHandler<TEnv>,
) => {
	const usesDefaultBodyParser = bodyParser === undefined;

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

				let body: unknown;
				try {
					body = bodyParser
						? await bodyParser(c.req)
						: await defaultBodyParser(c.req.raw);
				} catch (error) {
					if (!usesDefaultBodyParser) throw error;
					return c.json({ message: "Invalid request body" }, 400);
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
