import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	type NestInterceptor,
} from "@nestjs/common";
import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	handleHttpRoute,
	handleHttpRouteResult,
	isHttpRouteImplementation,
	type RouteImplementation,
	type ServerErrorHandlers,
} from "@rest-rpc/server";
import type { Observable } from "rxjs";
import { from, lastValueFrom } from "rxjs";
import { REST_RPC_ROUTE_METADATA, type RouteMetadata } from "./constants.ts";
import type {
	CreateContextInput,
	NestRouteContext,
	RestRpcModuleOptions,
} from "./module.ts";

type HeaderWriter = {
	setHeader(name: string, value: unknown): void;
};

type ExpressLikeResponse = HeaderWriter & {
	status(code: number): ExpressLikeResponse;
	json(body: unknown): unknown;
	send(body?: unknown): unknown;
	write?(body: unknown): unknown;
	end(): unknown;
};

type ExpressLikeRequest = {
	body?: unknown;
	query?: unknown;
	params?: unknown;
	headers?: unknown;
	once?(event: string, listener: () => void): unknown;
};

const isExpressLikeResponse = (value: unknown): value is ExpressLikeResponse =>
	typeof value === "object" &&
	value !== null &&
	"status" in value &&
	"json" in value &&
	"send" in value &&
	"setHeader" in value;

const assertRouteImplementation = (
	value: unknown,
	route: HttpRouteDeclaration,
): RouteImplementation<HttpRouteDeclaration> => {
	if (!isHttpRouteImplementation(value as RouteImplementation)) {
		throw new Error(
			`Controller method for "${route.method} ${route.path}" must return a rest-rpc route implementation.`,
		);
	}

	const implementation = value as RouteImplementation<HttpRouteDeclaration>;
	if (
		implementation.route.method !== route.method ||
		implementation.route.path !== route.path
	) {
		throw new Error(
			`Controller method for "${route.method} ${route.path}" returned an implementation for "${implementation.route.method} ${implementation.route.path}".`,
		);
	}

	return implementation;
};

const createRequestSignal = (req: ExpressLikeRequest, res: unknown) => {
	const controller = new AbortController();
	const abort = () => controller.abort();
	req.once?.("aborted", abort);
	if (res && typeof res === "object" && "once" in res) {
		const once = res.once;
		if (typeof once === "function") {
			once.call(res, "close", abort);
		}
	}
	return controller.signal;
};

const defaultCreateContext = ({
	req,
	res,
	signal,
}: CreateContextInput<ExpressLikeRequest, unknown>): NestRouteContext<
	ExpressLikeRequest,
	unknown
> => ({
	req,
	res,
	signal,
});

const writeStreamResponse = async (
	result: AsyncIterable<unknown>,
	res: ExpressLikeResponse,
	statusCode: number,
	contentType = "application/x-ndjson",
	mode: "ndjson" | "raw" = "ndjson",
) => {
	res.status(statusCode);
	res.setHeader("content-type", contentType);
	for await (const chunk of result) {
		if (res.write) {
			res.write(mode === "ndjson" ? `${JSON.stringify(chunk)}\n` : chunk);
			continue;
		}
		res.send(mode === "ndjson" ? `${JSON.stringify(chunk)}\n` : chunk);
	}
	return res.end();
};

@Injectable()
export class RestRpcRouteInterceptor implements NestInterceptor {
	constructor(options?: RestRpcModuleOptions<Record<string, unknown>>) {
		this.options = options;
	}

	private readonly options?: RestRpcModuleOptions<Record<string, unknown>>;

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		return from(this.handle(context, next));
	}

	private async handle(context: ExecutionContext, next: CallHandler) {
		const metadata = Reflect.getMetadata(
			REST_RPC_ROUTE_METADATA,
			context.getHandler(),
		) as RouteMetadata | undefined;
		if (!metadata) return lastValueFrom(next.handle());

		const http = context.switchToHttp();
		const req = http.getRequest<ExpressLikeRequest>();
		const res = http.getResponse<unknown>();
		const signal = createRequestSignal(req, res);
		const baseContext = {
			executionContext: context,
			req,
			res,
			signal,
		};
		const routeContext = {
			...defaultCreateContext(baseContext),
			...(await (this.options?.createContext
				? this.options.createContext(baseContext)
				: {})),
		};
		const implementation = assertRouteImplementation(
			await lastValueFrom(next.handle()),
			metadata.route,
		);

		const result = await handleHttpRoute(
			metadata.route,
			implementation.handler,
			{
				request: {
					body: req.body,
					query: req.query,
					pathParams: req.params,
					headers: req.headers,
				},
				context: routeContext,
				errorHandlers: this.options?.errorHandlers as
					| ServerErrorHandlers<Record<string, unknown>>
					| undefined,
			},
		);

		if (!isExpressLikeResponse(res)) {
			return result.kind === "json" ? result.body : undefined;
		}

		return handleHttpRouteResult(result, {
			setHeader: (name, value) => {
				if (value !== undefined) res.setHeader(name, value);
			},
			sendEmpty: (status) => {
				res.status(status);
				return undefined;
			},
			sendJson: (status, body) => {
				res.status(status);
				return body;
			},
			sendCustom: (status, body) => {
				res.status(status);
				return body;
			},
			sendStream: ({ body, status, contentType, mode }) =>
				writeStreamResponse(body, res, status, contentType, mode),
		});
	}
}
