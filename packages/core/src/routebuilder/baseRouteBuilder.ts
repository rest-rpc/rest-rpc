import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import {
	isCustomBody,
	isFormBody,
	isMultipartBody,
	isNoBody,
} from "../contract/body.ts";
import type {
	HttpMethod,
	OpenApiRouteOptions,
	RouteFactoryOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "../contract/contract.ts";
import { getPathParamNames } from "../contract/path.ts";
import type { RequestKeys, RequestSegment } from "../contract/request.ts";
import {
	isJsonQuery,
	jsonQuery as declareJsonQuery,
	REQUEST_CONTEXT_KEY,
} from "../contract/request.ts";
import { resolveBuiltInRequestKeys } from "../contract/requestKeys.ts";
import {
	installCallableDefault,
	mergeOpenApi,
	pathWithPrefix,
} from "./shared.ts";

const resolveSchemaRequestKeyNames = (schema: StandardSchemaV1) => {
	const keyInfo = resolveBuiltInRequestKeys(schema);
	return keyInfo ? Object.keys(keyInfo) : undefined;
};

export class BaseRouteBuilder {
	#commonMetadata?: RouteMetadata;
	#commonOpenApi?: RouteFactoryOptions["openApi"];
	#explicitRequestKeys?: RequestKeys;
	declare method: HttpMethod;
	declare path: string;
	declare mode?: "http" | "sse" | "webSocket";
	declare request?: RouteRequestDeclaration;

	constructor(
		method: HttpMethod,
		path: string,
		options: RouteFactoryOptions,
		request: RouteRequestDeclaration | undefined,
		mode?: "sse" | "webSocket",
	) {
		this.method = method;
		this.path = pathWithPrefix(path, options);
		if (mode) {
			this.mode = mode;
		}
		this.request = request;
		this.requestForWrite().keys ??= {};
		this.#commonMetadata = options.metadata;
		this.#commonOpenApi = options.openApi;
		installCallableDefault(this, "metadata", this.#commonMetadata);
		installCallableDefault(
			this,
			"openApi",
			mergeOpenApi(this.#commonOpenApi, undefined),
		);
		this.recalculateRequestKeys();
	}

	protected requestForWrite() {
		const request = (this.request ??= {});
		request.keys ??= {};
		return request;
	}

	protected requestKeyDeclarations(): Array<{
		segment: RequestSegment;
		keys: string[] | undefined;
	}> {
		const request = this.request;
		return [
			...(request?.body
				? [
						{
							segment: "body" as const,
							keys:
								isCustomBody(request.body) ||
								isFormBody(request.body) ||
								isMultipartBody(request.body) ||
								isNoBody(request.body)
									? ["body"]
									: resolveSchemaRequestKeyNames(request.body),
						},
					]
				: []),
			...(request?.query
				? [
						{
							segment: "query" as const,
							keys: isJsonQuery(request.query)
								? ["query"]
								: resolveSchemaRequestKeyNames(request.query),
						},
					]
				: []),
			...(request?.pathParams
				? (() => {
						const pathParamKeys = getPathParamNames(this.path);
						return [
							{
								segment: "pathParams" as const,
								keys:
									pathParamKeys.length > 0
										? pathParamKeys
										: resolveSchemaRequestKeyNames(request.pathParams),
							},
						];
					})()
				: []),
			...(request?.headers
				? [
						{
							segment: "headers" as const,
							keys: Object.keys(request.headers),
						},
					]
				: []),
		];
	}

	protected assertRequestKeysAllowed(keys: RequestKeys) {
		if (keys[REQUEST_CONTEXT_KEY] !== undefined) {
			throw new Error(
				`Route declaration at path "${this.path}" has a reserved request key "${REQUEST_CONTEXT_KEY}". Rename it to avoid conflict with the route handler context.`,
			);
		}
		if (isJsonQuery(this.request?.query) && keys.query !== undefined) {
			throw new Error(
				`Route declaration at path "${this.path}" has a "query" request key that conflicts with the JSON query value.`,
			);
		}

		const body = this.request?.body;
		if (
			body &&
			(isCustomBody(body) || isFormBody(body) || isMultipartBody(body)) &&
			keys.body !== undefined
		) {
			throw new Error(
				`Route declaration at path "${this.path}" has a "body" request key that conflicts with the request body payload.`,
			);
		}

		for (const key of Object.keys(keys)) {
			if (keys[key] === "headers" && key.toLowerCase() === "content-type") {
				throw new Error(
					`Route declaration at path "${this.path}" has a reserved header key "${key}". Use customBody({ schema, contentType }) to declare request content type instead.`,
				);
			}
		}
	}

	protected explicitRequestKeysFor(segment: RequestSegment) {
		return Object.entries(this.#explicitRequestKeys ?? {}).filter(
			([, value]) => value === segment,
		);
	}

	protected recalculateRequestKeys() {
		const request = this.request;
		if (!request || request.flattenKeys === false) return;

		const keys: RequestKeys = { ...this.#explicitRequestKeys };
		this.assertRequestKeysAllowed(keys);

		for (const {
			segment,
			keys: segmentKeys,
		} of this.requestKeyDeclarations()) {
			if (segmentKeys === undefined) {
				if (this.explicitRequestKeysFor(segment).length > 0) continue;
				throw new Error(
					`Could not resolve request keys for ${segment} schema on ${this.method} ${this.path}. Disable flattened request keys or call requestKeys before declaring this request segment.`,
				);
			}

			for (const key of segmentKeys) {
				const existing = keys[key];
				if (existing && existing !== segment) {
					throw new Error(
						`Route declaration at path "${this.path}" has duplicate request key "${key}" across its "body", "query", "pathParams" and "headers" definitions.`,
					);
				}
				keys[key] = segment;
			}
		}

		request.keys = keys;
	}

	query(schema: StandardSchemaV1) {
		this.requestForWrite().query = schema;
		this.recalculateRequestKeys();
		return this;
	}

	jsonQuery(schema: StandardSchemaV1) {
		this.requestForWrite().query = declareJsonQuery(schema);
		this.recalculateRequestKeys();
		return this;
	}

	pathParams(schema: StandardSchemaV1) {
		this.requestForWrite().pathParams = schema;
		this.recalculateRequestKeys();
		return this;
	}

	requestKeys(keys: RequestKeys) {
		this.#explicitRequestKeys = { ...keys };
		this.requestForWrite();
		this.recalculateRequestKeys();
		return this;
	}

	flattenRequestKeys(value: boolean) {
		this.requestForWrite().flattenKeys = value;
		return this;
	}

	strictStatusCodes(value: boolean) {
		Object.assign(this, { strictStatusCodes: value });
		return this;
	}

	metadata(metadata: RouteMetadata) {
		Object.assign(this, {
			metadata: {
				...this.#commonMetadata,
				...metadata,
			},
		});
		return this;
	}

	openApi(openApi: OpenApiRouteOptions) {
		Object.assign(this, {
			openApi: mergeOpenApi(this.#commonOpenApi, openApi),
		});
		return this;
	}
}
