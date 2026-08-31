import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	HttpMethod,
	OpenApiRouteOptions,
	RouteFactoryOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "../contract/contract.ts";
import type { RequestKeys } from "../contract/request.ts";
import { jsonQuery as declareJsonQuery } from "../contract/request.ts";
import {
	installCallableDefault,
	mergeOpenApi,
	pathWithPrefix,
} from "./shared.ts";

export class BaseRouteBuilder {
	#commonMetadata?: RouteMetadata;
	#commonOpenApi?: RouteFactoryOptions["openApi"];
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
		this.#commonMetadata = options.metadata;
		this.#commonOpenApi = options.openApi;
		installCallableDefault(this, "metadata", this.#commonMetadata);
		installCallableDefault(
			this,
			"openApi",
			mergeOpenApi(this.#commonOpenApi, undefined),
		);
	}

	protected requestForWrite() {
		return (this.request ??= {});
	}

	query(schema: StandardSchemaV1) {
		this.requestForWrite().query = schema;
		return this;
	}

	jsonQuery(schema: StandardSchemaV1) {
		this.requestForWrite().query = declareJsonQuery(schema);
		return this;
	}

	pathParams(schema: StandardSchemaV1) {
		this.requestForWrite().pathParams = schema;
		return this;
	}

	requestKeys(keys: RequestKeys) {
		this.requestForWrite().keys = { ...keys };
		return this;
	}

	flattenRequestKeys(value: boolean) {
		this.requestForWrite().flattenKeys = value;
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
