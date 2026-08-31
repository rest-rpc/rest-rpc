import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import {
	customBody as declareCustomBody,
	formBody as declareFormBody,
	multipartBody as declareMultipartBody,
	noBody,
	stream as declareStream,
	type CustomBody,
	type CustomBodyContentType,
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
import { BaseRouteBuilder } from "./base.ts";
import {
	type CustomResponseBodyFor,
	type EmptyObject,
	httpRequestDefaults,
	mergeOpenApi,
	type Merge,
	type OptionValue,
	type PathFor,
	type RequestFor,
	type Simplify,
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
		if (options.responses) {
			this.responses = { ...options.responses };
		}
	}

	body(schema: StandardSchemaV1) {
		this.requestForWrite().body = schema;
		return this;
	}

	formBody(input: BodyWithArrayKeysInput) {
		this.requestForWrite().body = toFormBody(input);
		return this;
	}

	multipartBody(input: BodyWithArrayKeysInput) {
		this.requestForWrite().body = toMultipartBody(input);
		return this;
	}

	customBody(input: CustomBodyInput) {
		this.requestForWrite().body = toCustomBody(input);
		return this;
	}

	headers(schemas: RequestSchemaRecord) {
		const request = this.requestForWrite();
		request.headers = {
			...request.headers,
			...schemas,
		};
		return this;
	}

	private addResponse(status: number, schema: ResponseDeclaration) {
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
}

type HttpBuilder<
	TMethod extends HttpMethod,
	TPath extends string,
	TRequest,
	TResponses,
	TMetadata,
	TOpenApi,
	TUsed extends string = never,
> = Simplify<
	{
		readonly method: TMethod;
		readonly path: TPath;
	} & (keyof TRequest extends never
		? { request?: never }
		: { request: TRequest }) &
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
				TPath,
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
				TPath,
				TRequest,
				Merge<
					TResponses,
					Record<TStatus, CustomResponseBodyFor<TSchema, TContentType>>
				>,
				TMetadata,
				TOpenApi,
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
				TPath,
				TRequest,
				Merge<TResponses, Record<TStatus, Stream<TSchema>>>,
				TMetadata,
				TOpenApi,
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
				TPath,
				TRequest,
				Merge<
					TResponses,
					Record<TStatus, Stream<CustomResponseBodyFor<TSchema, TContentType>>>
				>,
				TMetadata,
				TOpenApi,
				TUsed
			>;
		} & ("body" extends TUsed
			? EmptyObject
			: {
					body<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "body", TSchema>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "body"
					>;
					formBody<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "body", FormBody<TSchema>>,
						TResponses,
						TMetadata,
						TOpenApi,
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
						TPath,
						WithRequest<TRequest, "body", FormBody<TSchema, TArrayKeys>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "body"
					>;
					multipartBody<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "body", MultipartBody<TSchema>>,
						TResponses,
						TMetadata,
						TOpenApi,
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
						TPath,
						WithRequest<TRequest, "body", MultipartBody<TSchema, TArrayKeys>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "body"
					>;
					customBody<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "body", CustomBody<TSchema, undefined>>,
						TResponses,
						TMetadata,
						TOpenApi,
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
						TPath,
						WithRequest<TRequest, "body", CustomBody<TSchema, TContentType>>,
						TResponses,
						TMetadata,
						TOpenApi,
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
						TPath,
						WithRequest<TRequest, "query", TSchema>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "query"
					>;
					jsonQuery<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "query", JsonQuery<TSchema>>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "query"
					>;
				}) &
		("pathParams" extends TUsed
			? EmptyObject
			: {
					pathParams<const TSchema extends StandardSchemaV1>(
						schema: TSchema,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "pathParams", TSchema>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "pathParams"
					>;
				}) &
		("headers" extends TUsed
			? EmptyObject
			: {
					headers<const THeaders extends RequestSchemaRecord>(
						headers: THeaders,
					): HttpBuilder<
						TMethod,
						TPath,
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
						TPath,
						WithRequest<TRequest, "keys", TKeys>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "requestKeys"
					>;
				}) &
		("flattenRequestKeys" extends TUsed
			? EmptyObject
			: {
					flattenRequestKeys<const TFlatten extends boolean>(
						value: TFlatten,
					): HttpBuilder<
						TMethod,
						TPath,
						WithRequest<TRequest, "flattenKeys", TFlatten>,
						TResponses,
						TMetadata,
						TOpenApi,
						TUsed | "flattenRequestKeys"
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
							TPath,
							TRequest,
							TResponses,
							Merge<TMetadata, TLocal>,
							TOpenApi,
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
							TPath,
							TRequest,
							TResponses,
							TMetadata,
							Merge<TOpenApi, TLocal>,
							TUsed | "openApi"
						>);
				})
>;

export type HttpBuilderFor<
	TOptions,
	TMethod extends HttpMethod,
	TPath extends string,
> = HttpBuilder<
	TMethod,
	PathFor<TOptions, TPath>,
	RequestFor<TOptions>,
	OptionValue<TOptions, "responses", EmptyObject>,
	OptionValue<TOptions, "metadata", EmptyObject>,
	OptionValue<TOptions, "openApi", EmptyObject>
>;

export const createHttpRoute = (
	method: HttpMethod,
	path: string,
	options?: RouteFactoryOptions,
) => new HttpRouteBuilder(method, path, options);
