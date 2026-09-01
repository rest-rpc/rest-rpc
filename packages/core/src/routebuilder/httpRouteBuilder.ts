import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import {
	resolveBodyWithArrayKeys,
	type BodyWithArrayKeysInput,
	type BodyWithArrayKeysOptions,
	type CustomBody,
	type CustomBodyInput,
	type CustomBodyContentType,
	type CustomResponseBody,
	type CustomResponseInput,
	type FormBody,
	type MultipartBody,
	type NoBody,
	type Stream,
} from "../contract/body.ts";
import type {
	HttpMethod,
	HttpRouteDeclaration,
	OpenApiRouteOptions,
	RouteFactoryOptions,
	RouteMetadata,
} from "../contract/contract.ts";
import type {
	JsonQuery,
	RequestKeys,
	RequestSchemaRecord,
} from "../contract/request.ts";
import type {
	RegularResponseDeclaration,
	ResponseDeclaration,
	RouteResponses,
} from "../contract/response.ts";
import { BaseRouteBuilder } from "./baseRouteBuilder.ts";
import {
	type EmptyObject,
	type HttpRouteFor,
	httpRequestDefaults,
	type OptionValue,
	type RequestFor,
	type WithRequest,
} from "./shared.ts";

class HttpRouteBuilder extends BaseRouteBuilder {
	#localResponseStatuses = new Set<number>();
	declare method: HttpMethod;
	declare path: string;
	declare request?: HttpRouteDeclaration["request"];
	declare responses?: RouteResponses;

	constructor(
		method: HttpMethod,
		path: string,
		options: RouteFactoryOptions = {},
	) {
		super(method, path, options, httpRequestDefaults(options));
		if (typeof options.strictStatusCodes === "boolean") {
			Object.assign(this, { strictStatusCodes: options.strictStatusCodes });
		}
		if (options.responses) {
			this.responses = { ...options.responses };
		}
	}

	body(schema: StandardSchemaV1) {
		this.requestForWrite().body = schema;
		this.recalculateRequestKeys();
		return this;
	}

	formBody(input: BodyWithArrayKeysInput) {
		this.requestForWrite().body = {
			kind: "formBody",
			...resolveBodyWithArrayKeys(input),
		};
		this.recalculateRequestKeys();
		return this;
	}

	multipartBody(input: BodyWithArrayKeysInput) {
		this.requestForWrite().body = {
			kind: "multipartBody",
			...resolveBodyWithArrayKeys(input),
		};
		this.recalculateRequestKeys();
		return this;
	}

	customBody(input: CustomBodyInput) {
		this.requestForWrite().body =
			"~standard" in input
				? { kind: "customBody", schema: input }
				: { kind: "customBody", ...input };
		this.recalculateRequestKeys();
		return this;
	}

	headers(schemas: RequestSchemaRecord) {
		const request = this.requestForWrite();
		request.headers = {
			...request.headers,
			...schemas,
		};
		this.recalculateRequestKeys();
		return this;
	}

	private addResponse(status: number, schema: ResponseDeclaration) {
		if (this.#localResponseStatuses.size === 0) {
			this.assertRequestKeysComplete();
		}
		if (this.#localResponseStatuses.has(status)) {
			throw new Error(
				`Route declaration at path "${this.path}" has duplicate response status "${status}".`,
			);
		}
		this.#localResponseStatuses.add(status);
		this.responses = {
			...this.responses,
			[status]: schema,
		};
		return this;
	}

	response(status: number, schema?: RegularResponseDeclaration) {
		return this.addResponse(status, schema ?? { kind: "noBody" });
	}

	customResponse(status: number, input: CustomResponseInput) {
		return this.addResponse(status, { kind: "customBody", ...input });
	}

	streamResponse(status: number, schema: StandardSchemaV1) {
		return this.addResponse(status, { kind: "stream", schema });
	}

	customStreamResponse(status: number, input: CustomResponseInput) {
		return this.addResponse(status, {
			kind: "stream",
			schema: { kind: "customBody", ...input },
		});
	}
}

type HttpBuilder<
	TRoute extends { readonly method: HttpMethod },
	TRequest,
	TResponses,
	TUsed extends string = never,
> = {
	readonly path: string;
} & TRoute &
	(keyof TRequest extends never ? { request?: never } : { request: TRequest }) &
	(keyof TResponses extends never
		? { responses?: never }
		: { responses: TResponses }) & {
		response<
			const TStatus extends number,
			const TSchema extends RegularResponseDeclaration | undefined = undefined,
		>(
			status: TStatus,
			schema?: TSchema,
		): HttpBuilder<
			TRoute,
			TRequest,
			TResponses &
				Record<
					TStatus,
					TSchema extends RegularResponseDeclaration ? TSchema : NoBody
				>,
			TUsed | "response"
		>;
		customResponse<
			const TStatus extends number,
			const TSchema extends StandardSchemaV1,
			const TContentType extends CustomBodyContentType,
		>(
			status: TStatus,
			input: CustomResponseInput<TSchema, TContentType>,
		): HttpBuilder<
			TRoute,
			TRequest,
			TResponses & Record<TStatus, CustomResponseBody<TSchema, TContentType>>,
			TUsed | "response"
		>;
		streamResponse<
			const TStatus extends number,
			const TSchema extends StandardSchemaV1,
		>(
			status: TStatus,
			schema: TSchema,
		): HttpBuilder<
			TRoute,
			TRequest,
			TResponses & Record<TStatus, Stream<TSchema>>,
			TUsed | "response"
		>;
		customStreamResponse<
			const TStatus extends number,
			const TSchema extends StandardSchemaV1,
			const TContentType extends CustomBodyContentType,
		>(
			status: TStatus,
			input: CustomResponseInput<TSchema, TContentType>,
		): HttpBuilder<
			TRoute,
			TRequest,
			TResponses &
				Record<TStatus, Stream<CustomResponseBody<TSchema, TContentType>>>,
			TUsed | "response"
		>;
	} & ("response" extends TUsed
		? EmptyObject
		: "body" extends TUsed
			? EmptyObject
			: {
					body<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TRoute,
						WithRequest<TRequest, "body", TSchema>,
						TResponses,
						TUsed | "body"
					>;
					formBody<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TRoute,
						WithRequest<TRequest, "body", FormBody<TSchema>>,
						TResponses,
						TUsed | "body"
					>;
					formBody<
						const TSchema extends StandardSchemaV1,
						const TArrayKeys extends readonly string[],
					>(
						input: BodyWithArrayKeysOptions<TSchema, TArrayKeys>,
					): HttpBuilder<
						TRoute,
						WithRequest<TRequest, "body", FormBody<TSchema, TArrayKeys>>,
						TResponses,
						TUsed | "body"
					>;
					multipartBody<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TRoute,
						WithRequest<TRequest, "body", MultipartBody<TSchema>>,
						TResponses,
						TUsed | "body"
					>;
					multipartBody<
						const TSchema extends StandardSchemaV1,
						const TArrayKeys extends readonly string[],
					>(
						input: BodyWithArrayKeysOptions<TSchema, TArrayKeys>,
					): HttpBuilder<
						TRoute,
						WithRequest<TRequest, "body", MultipartBody<TSchema, TArrayKeys>>,
						TResponses,
						TUsed | "body"
					>;
					customBody<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TRoute,
						WithRequest<TRequest, "body", CustomBody<TSchema, undefined>>,
						TResponses,
						TUsed | "body"
					>;
					customBody<
						const TSchema extends StandardSchemaV1,
						const TContentType extends CustomBodyContentType,
					>(
						input: CustomResponseInput<TSchema, TContentType>,
					): HttpBuilder<
						TRoute,
						WithRequest<TRequest, "body", CustomBody<TSchema, TContentType>>,
						TResponses,
						TUsed | "body"
					>;
				}) &
	("response" extends TUsed
		? EmptyObject
		: "query" extends TUsed
			? EmptyObject
			: {
					query<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TRoute,
						WithRequest<TRequest, "query", TSchema>,
						TResponses,
						TUsed | "query"
					>;
					jsonQuery<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TRoute,
						WithRequest<TRequest, "query", JsonQuery<TSchema>>,
						TResponses,
						TUsed | "query"
					>;
				}) &
	("response" extends TUsed
		? EmptyObject
		: "params" extends TUsed
			? EmptyObject
			: {
					params<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TRoute,
						WithRequest<TRequest, "params", TSchema>,
						TResponses,
						TUsed | "params"
					>;
				}) &
	("response" extends TUsed
		? EmptyObject
		: "headers" extends TUsed
			? EmptyObject
			: {
					headers<const THeaders extends RequestSchemaRecord>(
						headers: THeaders,
					): HttpBuilder<
						TRoute,
						WithRequest<
							TRequest,
							"headers",
							(TRequest extends { headers: infer TCommon }
								? TCommon
								: EmptyObject) &
								THeaders
						>,
						TResponses,
						TUsed | "headers"
					>;
				}) &
	("response" extends TUsed
		? EmptyObject
		: "requestKeys" extends TUsed
			? EmptyObject
			: {
					requestKeys<const TKeys extends RequestKeys>(
						keys: TKeys,
					): HttpBuilder<
						TRoute,
						WithRequest<TRequest, "keys", TKeys>,
						TResponses,
						TUsed | "requestKeys"
					>;
				}) &
	("withMetadata" extends TUsed
		? { metadata: RouteMetadata }
		: "response" extends TUsed
			? EmptyObject
			: {
					withMetadata(
						metadata: RouteMetadata,
					): HttpBuilder<TRoute, TRequest, TResponses, TUsed | "withMetadata">;
				}) &
	("withOpenApi" extends TUsed
		? { openApi: OpenApiRouteOptions }
		: "response" extends TUsed
			? EmptyObject
			: {
					withOpenApi(
						openApi: OpenApiRouteOptions,
					): HttpBuilder<TRoute, TRequest, TResponses, TUsed | "withOpenApi">;
				});

export type HttpBuilderFor<TOptions, TMethod extends HttpMethod> = HttpBuilder<
	HttpRouteFor<TOptions, TMethod>,
	RequestFor<TOptions>,
	OptionValue<TOptions, "responses", EmptyObject>
>;

export const createHttpRoute = (
	method: HttpMethod,
	path: string,
	options?: RouteFactoryOptions,
) => new HttpRouteBuilder(method, path, options);
