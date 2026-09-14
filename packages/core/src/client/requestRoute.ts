import type { HttpMethod } from "../contract/routeDeclaration.ts";
import type { QuerySerialization } from "../contract/request.ts";

export type ClientRequestDeclaration = {
	body?: unknown;
	contentType?: string | readonly string[];
	query?: unknown;
	querySerialization?: QuerySerialization | readonly QuerySerialization[];
	params?: unknown;
	headers?: unknown;
};

export type ClientRequestRoute = {
	method: HttpMethod;
	path: string;
	request?: ClientRequestDeclaration;
};
