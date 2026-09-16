import type { HttpMethod, RouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import { createNodeResponseStream, createRequestSignal } from "@rest-rpc/node";
import {
	type RuntimeImplementationTree,
	flattenRouteImplementations,
	assertRequestContentType,
	handleHttpRoute,
	handleHttpRouteResult,
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Defines how an invalid request is handled through native Fastify arguments.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify#error-handling}
 */
export type RequestValidationErrorHandler = (
	error: RequestValidationError,
	request: FastifyRequest,
	reply: FastifyReply,
) => unknown;

/**
 * Defines how an invalid handler response is handled through native Fastify arguments.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify#error-handling}
 */
export type ResponseValidationErrorHandler = (
	error: ResponseValidationError,
	request: FastifyRequest,
	reply: FastifyReply,
) => unknown;

/**
 * Fastify pre-handler that also receives the matched rest-rpc route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify#prehandler}
 */
export type ExtendedFastifyPreHandler = (
	req: FastifyRequest,
	reply: FastifyReply,
	route: RouteDeclaration,
) => unknown;

/**
 * Options for registering rest-rpc routes on a Fastify instance.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify#options}
 */
export type RegisterRoutesOptions = {
	requestValidationErrorHandler?: RequestValidationErrorHandler;
	responseValidationErrorHandler?: ResponseValidationErrorHandler;
	preHandler?: ExtendedFastifyPreHandler[];
};

/**
 * Registers HTTP route implementations on a Fastify instance.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify}
 */
export function registerRoutes(
	app: FastifyInstance,
	implementations: RuntimeImplementationTree,
	options: RegisterRoutesOptions = {},
) {
	const {
		preHandler = [],
		requestValidationErrorHandler,
		responseValidationErrorHandler,
	} = options;

	for (const implementation of flattenRouteImplementations(implementations)) {
		const route = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;

		app[method](
			toColonPath(route.path),
			{
				preHandler: preHandler.map((handler) => {
					return async (req: FastifyRequest, reply: FastifyReply) => {
						await handler(req, reply, route);
					};
				}),
			},
			async (req: FastifyRequest, reply: FastifyReply) => {
				const rejection = assertRequestContentType(
					route,
					req.headers["content-type"],
				);
				if (rejection) {
					return reply
						.status(rejection.status)
						.send({ message: rejection.message });
				}

				const signal = createRequestSignal(req.raw, reply.raw);
				const result = await handleHttpRoute(implementation, {
					request: {
						body: req.body,
						query: new URL(req.raw.url ?? "/", "http://localhost").searchParams,
						params: req.params,
						headers: req.headers,
					},
					context: {},
					handlerFields: { req, reply, signal },
				});
				if (result instanceof RequestValidationError) {
					if (requestValidationErrorHandler) {
						return requestValidationErrorHandler(result, req, reply);
					}

					return reply.status(result.status).send(result.responseBody);
				}

				if (result instanceof ResponseValidationError) {
					if (responseValidationErrorHandler) {
						return responseValidationErrorHandler(result, req, reply);
					}

					return reply.status(result.status).send(result.responseBody);
				}

				return handleHttpRouteResult(result, {
					setHeader: (name, value) => reply.header(name, value),
					sendEmpty: (status) => reply.status(status).send(),
					sendJson: (status, body) => reply.status(status).send(body),
					sendCustom: (status, body) =>
						reply
							.status(status)
							.send(
								body instanceof Uint8Array ? Buffer.from(body) : String(body),
							),
					sendStream: ({ body, status, contentType }) =>
						reply
							.status(status)
							.type(contentType)
							.send(createNodeResponseStream(body)),
				});
			},
		);
	}
}
