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
import { mergeOpenApi, pathWithPrefix } from "./shared.ts";

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
		if (this.#commonMetadata) {
			Object.assign(this, { metadata: this.#commonMetadata });
		}
		const commonOpenApi = mergeOpenApi(this.#commonOpenApi, undefined);
		if (commonOpenApi) {
			Object.assign(this, { openApi: commonOpenApi });
		}
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
			...(request?.params
				? (() => {
						const pathParamKeys = getPathParamNames(this.path);
						return [
							{
								segment: "params" as const,
								keys:
									pathParamKeys.length > 0
										? pathParamKeys
										: resolveSchemaRequestKeyNames(request.params),
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

	protected assertRequestKeysComplete() {
		const request = this.request;
		if (!request || request.flattenKeys === false) return;

		for (const { segment, keys } of this.requestKeyDeclarations()) {
			if (
				keys === undefined &&
				this.explicitRequestKeysFor(segment).length === 0
			) {
				throw new Error(
					`Could not resolve request keys for ${segment} schema on ${this.method} ${this.path}. Disable flattened request keys or call requestKeys before finalizing this route.`,
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
				continue;
			}

			for (const key of segmentKeys) {
				const existing = keys[key];
				if (existing && existing !== segment) {
					throw new Error(
						`Route declaration at path "${this.path}" has duplicate request key "${key}" across its "body", "query", "params" and "headers" definitions.`,
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

	params(schema: StandardSchemaV1) {
		this.requestForWrite().params = schema;
		this.recalculateRequestKeys();
		return this;
	}

	requestKeys(keys: RequestKeys) {
		this.#explicitRequestKeys = { ...keys };
		this.requestForWrite();
		this.recalculateRequestKeys();
		return this;
	}

	withMetadata(metadata: RouteMetadata) {
		Object.assign(this, {
			metadata: {
				...this.#commonMetadata,
				...metadata,
			},
		});
		return this;
	}

	withOpenApi(openApi: OpenApiRouteOptions) {
		Object.assign(this, {
			openApi: mergeOpenApi(this.#commonOpenApi, openApi),
		});
		return this;
	}
}
