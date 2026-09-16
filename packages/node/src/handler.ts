import type { IncomingMessage, ServerResponse } from "node:http";
import {
	createRouteMatcher,
	assertRequestContentType,
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
	type RuntimeImplementationTree,
} from "@rest-rpc/server";
import type { DefaultContext, NodeRouteHandlerResult } from "./index.ts";
import { createRequestSignal } from "./lifecycle.ts";
import {
	defaultBodyParser,
	parseRequestTarget,
	type NodeBodyParser,
} from "./request.ts";
import { writeNodeResponse } from "./response.ts";

/**
 * Customizes request parsing and validation failures for a Node HTTP handler.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#options}
 */
export type CreateNodeHandlerOptions = {
	bodyParser?: NodeBodyParser;
	requestValidationErrorHandler?: RequestValidationErrorHandler;
	responseValidationErrorHandler?: ResponseValidationErrorHandler;
};

/**
 * Defines how an invalid request is written through native Node HTTP arguments.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#error-handling}
 */
export type RequestValidationErrorHandler = (
	error: RequestValidationError,
	request: IncomingMessage,
	response: ServerResponse,
) => unknown;

/**
 * Defines how invalid handler output is written through native Node HTTP arguments.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#error-handling}
 */
export type ResponseValidationErrorHandler = (
	error: ResponseValidationError,
	request: IncomingMessage,
	response: ServerResponse,
) => unknown;

type ContextArguments = {} extends DefaultContext
	? [context?: DefaultContext]
	: [context: DefaultContext];

/**
 * Creates a Node HTTP handler that dispatches matching rest-rpc routes.
 *
 * @remarks Unmatched requests are left untouched and reported with
 * `matched: false` so the surrounding server can provide fallback routing.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node}
 */
export function createRouteHandler(
	implementations: RuntimeImplementationTree,
	options: CreateNodeHandlerOptions = {},
): (
	request: IncomingMessage,
	response: ServerResponse,
	...contextArguments: ContextArguments
) => Promise<NodeRouteHandlerResult> {
	const matchRoute = createRouteMatcher(implementations);
	const bodyParser = options.bodyParser ?? defaultBodyParser;

	return async (request, response, ...contextArguments) => {
		const url = parseRequestTarget(request);
		const matched = matchRoute({
			method: request.method ?? "GET",
			path: url.pathname,
		});
		if (!matched) {
			return { matched: false };
		}

		const rejection = assertRequestContentType(
			matched.implementation.route,
			request.headers["content-type"],
		);
		if (rejection) {
			response.statusCode = rejection.status;
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify({ message: rejection.message }));
			return { matched: true };
		}

		const signal = createRequestSignal(request, response);
		let body: unknown;
		try {
			body = await bodyParser(request);
		} catch (error) {
			if (options.bodyParser !== undefined) throw error;
			response.statusCode = 400;
			response.setHeader("content-type", "application/json");
			response.end(
				JSON.stringify({ message: "Failed to parse request body." }),
			);
			return { matched: true };
		}
		const parsedRequest = {
			params: matched.params,
			query: url.searchParams,
			headers: request.headers,
			body,
		};

		const result = await handleHttpRoute(matched.implementation, {
			request: parsedRequest,
			context: contextArguments[0] ?? {},
			handlerFields: { req: request, res: response, signal },
		});

		if (result instanceof RequestValidationError) {
			if (options.requestValidationErrorHandler) {
				await options.requestValidationErrorHandler(result, request, response);
			} else {
				response.statusCode = result.status;
				response.setHeader("content-type", "application/json");
				response.end(JSON.stringify(result.responseBody));
			}
			return { matched: true };
		}

		if (result instanceof ResponseValidationError) {
			if (options.responseValidationErrorHandler) {
				await options.responseValidationErrorHandler(result, request, response);
			} else {
				if (response.headersSent) throw result;
				response.statusCode = result.status;
				response.setHeader("content-type", "application/json");
				response.end(JSON.stringify(result.responseBody));
			}
			return { matched: true };
		}

		try {
			if (!response.destroyed) await writeNodeResponse(result, response);
		} catch (error) {
			if (!(error instanceof ResponseValidationError)) throw error;
			if (options.responseValidationErrorHandler) {
				await options.responseValidationErrorHandler(error, request, response);
			} else {
				if (response.headersSent) throw error;
				response.statusCode = error.status;
				response.setHeader("content-type", "application/json");
				response.end(JSON.stringify(error.responseBody));
			}
		}
		return { matched: true };
	};
}
