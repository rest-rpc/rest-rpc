import {
	deserializeBody,
	normalizeMediaType,
	type BodyCodec,
} from "../codecs/index.ts";
import type { RouteDeclaration } from "../contract/contract.ts";
import type {
	DeclaredClientResponse,
	ResponseDeclaration,
	SuccessfulDeclaredClientResponse,
} from "../contract/response.ts";
import { getRouteResponses } from "../contract/response.ts";
import { validateStandardSchema } from "../standard-schema/index.ts";
import { parseNdjsonStream } from "./stream.ts";
import type { FetchArgs } from "./types.ts";

type FetchedRouteResponse<E extends RouteDeclaration> =
	DeclaredClientResponse<E> extends infer TResponse
		? TResponse extends object
			? TResponse & { headers: Headers }
			: never
		: never;

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

export const getResponseSchema = (
	route: RouteDeclaration,
	status: number,
): ResponseDeclaration | undefined => {
	const entry = Object.entries(getRouteResponses(route)).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	return entry?.[1];
};

const assertResponseContentType = (
	declared: string | readonly string[] | undefined,
	rawResponse: Response,
) => {
	const received = normalizeMediaType(
		rawResponse.headers.get("content-type") ?? "",
	);
	if (!received || declared === undefined) return;
	const allowed = typeof declared === "string" ? [declared] : declared;
	if (
		!allowed.some((contentType) => normalizeMediaType(contentType) === received)
	) {
		throw new Error("Server returned an unsupported response content-type.");
	}
};

const readBody = async (
	schema: ResponseDeclaration,
	rawResponse: Response,
	validate: boolean,
	generated: boolean,
	codecs: readonly BodyCodec<Response>[] | undefined,
	method: string,
) => {
	if (method === "HEAD" || [204, 205, 304].includes(rawResponse.status))
		return undefined;
	if (schema.kind === "stream") {
		if (!rawResponse.body)
			throw new Error("Server returned an empty stream response");
		return parseNdjsonStream(
			validate ? schema.body : undefined,
			rawResponse.body,
			validate,
		);
	}
	if (!generated && schema.body === undefined) return undefined;
	if (!generated) assertResponseContentType(schema.contentType, rawResponse);
	const value = await deserializeBody(rawResponse, codecs);
	if (!validate || schema.body === undefined) return value;
	const result = await validateStandardSchema(schema.body, value);
	if (result.issues) throw result.issues;
	return result.value;
};

const readDeclaredHeaders = async (
	schema: ResponseDeclaration,
	rawResponse: Response,
	validate: boolean,
) => {
	const { headers } = schema;
	if (!headers) return {};

	const rawHeaders = Object.fromEntries(rawResponse.headers.entries());
	if (!validate) return { responseHeaders: rawHeaders };

	const result = await validateStandardSchema(headers, rawHeaders);
	if (result.issues) throw result.issues;
	return { responseHeaders: result.value };
};

export type RouteRequestFn = <E extends RouteDeclaration>(
	route: E,
	routePath: readonly string[],
	...args: FetchArgs<E>
) => Promise<Response>;

export const fetchResponse = async <E extends RouteDeclaration>(
	request: RouteRequestFn,
	validateResponse: boolean,
	bodyCodecs: readonly BodyCodec<Response>[] | undefined,
	route: E,
	routePath: readonly string[],
	...args: FetchArgs<E>
): Promise<FetchedRouteResponse<E>> => {
	const rawResponse = await request(route, routePath, ...args);
	if (
		!Number.isInteger(rawResponse.status) ||
		rawResponse.status < 100 ||
		rawResponse.status > 599
	) {
		throw new Error(
			`Server returned invalid HTTP response status "${rawResponse.status}".`,
		);
	}

	const schema = getResponseSchema(route, rawResponse.status);
	if (!schema) {
		throw new Error("Request did not return a declared response");
	}
	return {
		status: rawResponse.status,
		body: await readBody(
			schema,
			rawResponse,
			validateResponse,
			route.source === "generated",
			bodyCodecs,
			route.method,
		),
		headers: rawResponse.headers,
		...(await readDeclaredHeaders(schema, rawResponse, validateResponse)),
	} as FetchedRouteResponse<E>;
};

export const fetchSuccess = async <E extends RouteDeclaration>(
	fetchRouteResponse: (
		route: E,
		routePath: readonly string[],
		...args: FetchArgs<E>
	) => Promise<{ status: number; body?: unknown }>,
	route: E,
	routePath: readonly string[],
	...args: FetchArgs<E>
): Promise<SuccessfulClientResponseBody<E>> => {
	const response = await fetchRouteResponse(route, routePath, ...args);

	if (!("body" in response) || !isSuccessStatus(response.status)) {
		throw new Error("Request did not return a declared success response");
	}

	return response.body as SuccessfulClientResponseBody<E>;
};

type SuccessfulClientResponseBody<E extends RouteDeclaration> =
	SuccessfulDeclaredClientResponse<E> extends infer TResponse
		? TResponse extends { body: infer TBody }
			? TBody
			: never
		: never;
