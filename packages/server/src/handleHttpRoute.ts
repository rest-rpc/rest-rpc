import type {
	ResponseBodySchema,
	ResponseDeclaration,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import {
	getResponseBody,
	getResponseContentType,
	getRouteResponses,
	isCustomBody,
	isNoBody,
	isStream,
} from "@rest-rpc/core/contract";
import type { HttpHeaders } from "./headers.ts";
import { RouteResponseError } from "./routeResponseError.ts";
import { RequestValidationError } from "./validationErrors.ts";
import type { RuntimeRouteHandler } from "./routeBuilder.types.ts";
import type { ImplicitResponseEnvelope } from "./routeBuilder.types.ts";
import {
	resolveCustomResponseBody,
	type RequestSegments,
	validateRequest,
	validateResponseBody,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";

type HttpRouteResultBase = {
	responseKindMetadata?: boolean;
	status: number;
	headers?: HttpHeaders;
};

/**
 * Identifies how a stream route result should be written by an adapter.
 */
export type HttpRouteResultStreamMode = "ndjson" | "raw";

/**
 * A normalized HTTP route result ready for an adapter-specific writer.
 */
export type HttpRouteResult =
	| (HttpRouteResultBase & { kind: "empty" })
	| (HttpRouteResultBase & { kind: "json"; body: unknown })
	| (HttpRouteResultBase & {
			kind: "custom";
			body: unknown;
			contentType: string;
	  })
	| (HttpRouteResultBase & {
			kind: "stream";
			body: AsyncIterable<unknown>;
			contentType?: string;
			mode?: HttpRouteResultStreamMode;
	  });

/**
 * Inputs needed to invoke and normalize one HTTP route handler.
 */
export type HandleHttpRouteOptions<
	TAdditionalHandlerFields extends object = Record<never, never>,
	TContext extends object = Record<never, never>,
> = {
	request: RequestSegments;
	context: TContext;
	handlerFields: TAdditionalHandlerFields;
};

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
	value !== null &&
	(typeof value === "object" || typeof value === "function") &&
	Symbol.asyncIterator in value &&
	typeof value[Symbol.asyncIterator] === "function";

const classifyImplicitHttpResponse = (
	response: ImplicitResponseEnvelope,
): HttpRouteResult => {
	const headers = response.responseHeaders;
	if (!("body" in response)) {
		return {
			kind: "empty",
			status: response.status,
			headers,
		};
	}

	const body = response.body;
	const { contentType } = response;

	if (isAsyncIterable(body)) {
		return {
			kind: "stream",
			status: response.status,
			headers,
			body,
			...(contentType !== undefined
				? { contentType, mode: "raw" as const }
				: { mode: "ndjson" as const }),
		};
	}

	if (contentType !== undefined) {
		return {
			kind: "custom",
			status: response.status,
			headers,
			body,
			contentType,
		};
	}

	return { kind: "json", status: response.status, headers, body };
};

const getResponseSchema = (
	route: RouteDeclaration,
	status: number,
): ResponseDeclaration => {
	const entry = Object.entries(getRouteResponses(route)).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	if (!entry) {
		throw new Error(
			`Route response for "${route.method} ${route.path}" returned undeclared status ${status}.`,
		);
	}

	return entry[1];
};

type DeclaredResponseEnvelope = {
	status: number;
	body?: unknown;
	contentType?: string;
	responseHeaders?: Record<string, unknown>;
};

const normalizeCustomBodyResult = async (
	schema: ResponseBodySchema,
	declaredContentType: string | readonly string[],
	body: unknown,
	contentType: unknown,
) => {
	const result = resolveCustomResponseBody(
		declaredContentType,
		body,
		contentType,
		"Unsupported custom response body contentType.",
	);

	return {
		contentType: result.contentType,
		body: await validateResponseBody(schema, result.body),
	};
};

const normalizeResponseResult = async (
	route: RouteDeclaration,
	result: DeclaredResponseEnvelope,
): Promise<HttpRouteResult> => {
	const schema = getResponseSchema(route, result.status);
	const bodySchema = getResponseBody(schema);
	const declaredHeaders = await validateResponseHeaders(
		schema,
		result.responseHeaders,
	);
	const headers = declaredHeaders;

	if (bodySchema && isNoBody(bodySchema)) {
		return {
			kind: "empty",
			status: result.status,
			headers,
		};
	}

	if (bodySchema && isStream(bodySchema)) {
		if (isCustomBody(bodySchema.schema)) {
			const streamResult = resolveCustomResponseBody(
				bodySchema.schema.contentType,
				result.body,
				result.contentType,
				"Unsupported custom stream response contentType.",
			);

			return {
				kind: "stream",
				status: result.status,
				headers,
				contentType: streamResult.contentType,
				body: validateResponseStreamChunks(
					streamResult.body as AsyncIterable<unknown>,
					bodySchema,
				),
			};
		}

		return {
			kind: "stream",
			status: result.status,
			headers,
			body: validateResponseStreamChunks(
				result.body as AsyncIterable<unknown>,
				bodySchema,
			),
		};
	}

	const declaredContentType = getResponseContentType(schema);
	if (bodySchema && declaredContentType !== undefined) {
		const customResult = await normalizeCustomBodyResult(
			bodySchema,
			declaredContentType,
			result.body,
			result.contentType,
		);
		return {
			kind: "custom",
			status: result.status,
			headers,
			contentType: customResult.contentType,
			body: customResult.body,
		};
	}

	return {
		kind: "json",
		status: result.status,
		headers,
		body: await validateResponseBody(bodySchema, result.body),
	};
};

const normalizeRouteResponseError = async (
	route: RouteDeclaration,
	error: RouteResponseError,
): Promise<HttpRouteResult> => {
	return normalizeResponseResult(route, {
		status: error.status,
		body: error.body,
		contentType: error.contentType,
		responseHeaders: error.responseHeaders,
	});
};

/**
 * Validates an HTTP request, invokes a route handler, and normalizes its result.
 */
export async function handleHttpRoute<
	TAdditionalHandlerFields extends object = Record<never, never>,
	TContext extends object = Record<never, never>,
>(
	route: RouteDeclaration,
	handler: RuntimeRouteHandler,
	options: HandleHttpRouteOptions<TAdditionalHandlerFields, TContext>,
): Promise<HttpRouteResult> {
	const requestValidation = await validateRequest(route, options.request);
	if (!requestValidation.success) {
		throw new RequestValidationError(requestValidation.issues);
	}

	let handlerResult: unknown;
	try {
		handlerResult = await handler({
			...options.handlerFields,
			...(route.kind === "procedure"
				? route.request?.body
					? { input: requestValidation.data.body }
					: {}
				: requestValidation.data),
			context: options.context,
			route,
		});
	} catch (error) {
		if (error instanceof RouteResponseError) {
			return normalizeRouteResponseError(route, error);
		}
		throw error;
	}

	const hasDeclaredResponses = Object.keys(route.responses).length > 0;
	if (route.kind === "procedure") {
		return hasDeclaredResponses
			? normalizeResponseResult(route, { status: 200, body: handlerResult })
			: { kind: "json", status: 200, body: handlerResult };
	}

	return hasDeclaredResponses
		? normalizeResponseResult(route, handlerResult as DeclaredResponseEnvelope)
		: classifyImplicitHttpResponse(handlerResult as ImplicitResponseEnvelope);
}
