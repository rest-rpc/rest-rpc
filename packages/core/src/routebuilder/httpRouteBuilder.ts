import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import {
	customBody as declareCustomBody,
	formBody as declareFormBody,
	multipartBody as declareMultipartBody,
	noBody,
	stream as declareStream,
	type CustomBody,
	type CustomBodyContentType,
	type CustomResponseBody,
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
	ResponseDeclaration,
	ResponseHeaders,
	RouteResponses,
} from "../contract/response.ts";
import { BaseRouteBuilder } from "./baseRouteBuilder.ts";
import {
	type EmptyObject,
	httpRequestDefaults,
	mergeOpenApi,
	type Merge,
	type OptionValue,
	type RequestFor,
	type Simplify,
	type StrictStatusCodesFor,
	type WithRequest,
} from "./shared.ts";

type RegularResponseDeclaration =
	| StandardSchemaV1
	| {
			body: StandardSchemaV1;
			headers: ResponseHeaders;
	  };

type BodyWithArrayKeysInput =
	| StandardSchemaV1
	| {
			schema: StandardSchemaV1;
			arrayKeys: readonly string[];
	  };

type CustomBodyInput =
	| StandardSchemaV1
	| {
			schema: StandardSchemaV1;
			contentType: CustomBodyContentType;
	  };

type CustomResponseInput = {
	schema: StandardSchemaV1;
	contentType: CustomBodyContentType;
};

type FinalizedHttpRoute<
	TMethod extends HttpMethod,
	TRequest,
	TResponses,
	TMetadata,
	TOpenApi,
	TStrictStatusCodes,
> = {
	readonly method: TMethod;
	readonly path: string;
} & (keyof TRequest extends never
	? { request?: never }
	: { request: TRequest }) &
	([TStrictStatusCodes] extends [boolean]
		? { readonly strictStatusCodes: TStrictStatusCodes }
		: EmptyObject) &
	(keyof TResponses extends never
		? { responses?: never }
		: { responses: TResponses }) &
	(keyof TMetadata extends never ? EmptyObject : { metadata: TMetadata }) &
	(keyof TOpenApi extends never ? EmptyObject : { openApi: TOpenApi });

type CustomResponseBodyFor<
	TSchema extends StandardSchemaV1,
	TContentType extends CustomBodyContentType,
> = Extract<CustomBody<TSchema, TContentType>, CustomResponseBody>;

const toFormBody = declareFormBody as (
	input: BodyWithArrayKeysInput,
) => FormBody;
const toMultipartBody = declareMultipartBody as (
	input: BodyWithArrayKeysInput,
) => MultipartBody;
const toCustomBody = declareCustomBody as (
	input: CustomBodyInput,
) => CustomBody;

class HttpRouteBuilder extends BaseRouteBuilder {
	#commonOpenApi?: RouteFactoryOptions["openApi"];
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
		this.#commonOpenApi = options.openApi;
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
		this.requestForWrite().body = toFormBody(input);
		this.recalculateRequestKeys();
		return this;
	}

	multipartBody(input: BodyWithArrayKeysInput) {
		this.requestForWrite().body = toMultipartBody(input);
		this.recalculateRequestKeys();
		return this;
	}

	customBody(input: CustomBodyInput) {
		this.requestForWrite().body = toCustomBody(input);
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
		return this.addResponse(status, schema ?? noBody());
	}

	customResponse(status: number, input: CustomResponseInput) {
		return this.addResponse(status, declareCustomBody(input));
	}

	streamResponse(status: number, schema: StandardSchemaV1) {
		return this.addResponse(status, declareStream(schema));
	}

	customStreamResponse(status: number, input: CustomResponseInput) {
		return this.addResponse(status, declareStream(declareCustomBody(input)));
	}

	openApi(openApi: OpenApiRouteOptions) {
		Object.assign(this, {
			openApi: mergeOpenApi(this.#commonOpenApi, openApi),
		});
		return this;
	}

	finalize(): HttpRouteDeclaration {
		this.assertRequestKeysComplete();
		return this as unknown as HttpRouteDeclaration;
	}
}

type HttpBuilder<
	TMethod extends HttpMethod,
	TRequest,
	TResponses,
	TMetadata,
	TOpenApi,
	TStrictStatusCodes,
	TUsed extends string = never,
> = Simplify<
	{
		readonly method: TMethod;
		readonly path: string;
	} & (keyof TRequest extends never
		? { request?: never }
		: { request: TRequest }) &
		([TStrictStatusCodes] extends [boolean]
			? { readonly strictStatusCodes: TStrictStatusCodes }
			: EmptyObject) &
		(keyof TResponses extends never
			? { responses?: never }
			: { responses: TResponses }) & {
			response<
				const TStatus extends number,
				const TSchema extends RegularResponseDeclaration | undefined =
					undefined,
			>(
				status: TStatus,
				schema?: TSchema,
			): HttpBuilder<
				TMethod,
				TRequest,
				Merge<
					TResponses,
					Record<
						TStatus,
						TSchema extends RegularResponseDeclaration ? TSchema : NoBody
					>
				>,
				TMetadata,
				TOpenApi,
				TStrictStatusCodes,
				TUsed
			>;
			customResponse<
				const TStatus extends number,
				const TSchema extends StandardSchemaV1,
				const TContentType extends CustomBodyContentType,
			>(
				status: TStatus,
				input: { schema: TSchema; contentType: TContentType },
			): HttpBuilder<
				TMethod,
				TRequest,
				Merge<
					TResponses,
					Record<TStatus, CustomResponseBodyFor<TSchema, TContentType>>
				>,
				TMetadata,
				TOpenApi,
				TStrictStatusCodes,
				TUsed
			>;
			streamResponse<
				const TStatus extends number,
				const TSchema extends StandardSchemaV1,
			>(
				status: TStatus,
				schema: TSchema,
			): HttpBuilder<
				TMethod,
				TRequest,
				Merge<TResponses, Record<TStatus, Stream<TSchema>>>,
				TMetadata,
				TOpenApi,
				TStrictStatusCodes,
				TUsed
			>;
			customStreamResponse<
				const TStatus extends number,
				const TSchema extends StandardSchemaV1,
				const TContentType extends CustomBodyContentType,
			>(
				status: TStatus,
				input: { schema: TSchema; contentType: TContentType },
			): HttpBuilder<
				TMethod,
				TRequest,
				Merge<
					TResponses,
					Record<TStatus, Stream<CustomResponseBodyFor<TSchema, TContentType>>>
				>,
				TMetadata,
				TOpenApi,
				TStrictStatusCodes,
				TUsed
			>;
		} & ("body" extends TUsed
			? EmptyObject
			: {
					body<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						WithRequest<TRequest, "body", TSchema>,
						TResponses,
						TMetadata,
						TOpenApi,
						TStrictStatusCodes,
						TUsed | "body"
					>;
					formBody<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						WithRequest<TRequest, "body", FormBody<TSchema>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TStrictStatusCodes,
						TUsed | "body"
					>;
					formBody<
						const TSchema extends StandardSchemaV1,
						const TArrayKeys extends readonly string[],
					>(input: {
						schema: TSchema;
						arrayKeys: TArrayKeys;
					}): HttpBuilder<
						TMethod,
						WithRequest<TRequest, "body", FormBody<TSchema, TArrayKeys>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TStrictStatusCodes,
						TUsed | "body"
					>;
					multipartBody<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						WithRequest<TRequest, "body", MultipartBody<TSchema>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TStrictStatusCodes,
						TUsed | "body"
					>;
					multipartBody<
						const TSchema extends StandardSchemaV1,
						const TArrayKeys extends readonly string[],
					>(input: {
						schema: TSchema;
						arrayKeys: TArrayKeys;
					}): HttpBuilder<
						TMethod,
						WithRequest<TRequest, "body", MultipartBody<TSchema, TArrayKeys>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TStrictStatusCodes,
						TUsed | "body"
					>;
					customBody<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						WithRequest<TRequest, "body", CustomBody<TSchema, undefined>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TStrictStatusCodes,
						TUsed | "body"
					>;
					customBody<
						const TSchema extends StandardSchemaV1,
						const TContentType extends CustomBodyContentType,
					>(input: {
						schema: TSchema;
						contentType: TContentType;
					}): HttpBuilder<
						TMethod,
						WithRequest<TRequest, "body", CustomBody<TSchema, TContentType>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TStrictStatusCodes,
						TUsed | "body"
					>;
				}) &
		("query" extends TUsed
			? EmptyObject
			: {
					query<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						WithRequest<TRequest, "query", TSchema>,
						TResponses,
						TMetadata,
						TOpenApi,
						TStrictStatusCodes,
						TUsed | "query"
					>;
					jsonQuery<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						WithRequest<TRequest, "query", JsonQuery<TSchema>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TStrictStatusCodes,
						TUsed | "query"
					>;
				}) &
		("params" extends TUsed
			? EmptyObject
			: {
					params<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						WithRequest<TRequest, "params", TSchema>,
						TResponses,
						TMetadata,
						TOpenApi,
						TStrictStatusCodes,
						TUsed | "params"
					>;
				}) &
		("headers" extends TUsed
			? EmptyObject
			: {
					headers<const THeaders extends RequestSchemaRecord>(
						headers: THeaders,
					): HttpBuilder<
						TMethod,
						WithRequest<
							TRequest,
							"headers",
							Merge<
								TRequest extends { headers: infer TCommon }
									? TCommon
									: EmptyObject,
								THeaders
							>
						>,
						TResponses,
						TMetadata,
						TOpenApi,
						TStrictStatusCodes,
						TUsed | "headers"
					>;
				}) &
		("requestKeys" extends TUsed
			? EmptyObject
			: {
					requestKeys<const TKeys extends RequestKeys>(
						keys: TKeys,
					): HttpBuilder<
						TMethod,
						WithRequest<TRequest, "keys", TKeys>,
						TResponses,
						TMetadata,
						TOpenApi,
						TStrictStatusCodes,
						TUsed | "requestKeys"
					>;
				}) &
		("metadata" extends TUsed
			? { metadata: TMetadata }
			: {
					metadata: TMetadata &
						RouteMetadata &
						(<const TLocal extends RouteMetadata>(
							metadata: TLocal,
						) => HttpBuilder<
							TMethod,
							TRequest,
							TResponses,
							RouteMetadata,
							TOpenApi,
							TStrictStatusCodes,
							TUsed | "metadata"
						>);
				}) &
		("openApi" extends TUsed
			? { openApi: TOpenApi }
			: {
					openApi: TOpenApi &
						OpenApiRouteOptions &
						(<const TLocal extends OpenApiRouteOptions>(
							openApi: TLocal,
						) => HttpBuilder<
							TMethod,
							TRequest,
							TResponses,
							TMetadata,
							Merge<TOpenApi, TLocal>,
							TStrictStatusCodes,
							TUsed | "openApi"
						>);
				}) & {
			finalize(): FinalizedHttpRoute<
				TMethod,
				TRequest,
				TResponses,
				TMetadata,
				TOpenApi,
				TStrictStatusCodes
			>;
		}
>;

export type HttpBuilderFor<TOptions, TMethod extends HttpMethod> = HttpBuilder<
	TMethod,
	RequestFor<TOptions>,
	OptionValue<TOptions, "responses", EmptyObject>,
	RouteMetadata,
	OptionValue<TOptions, "openApi", EmptyObject>,
	StrictStatusCodesFor<TOptions>
>;

export const createHttpRoute = (
	method: HttpMethod,
	path: string,
	options?: RouteFactoryOptions,
) => new HttpRouteBuilder(method, path, options);
