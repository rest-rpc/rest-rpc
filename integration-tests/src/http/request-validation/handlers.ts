import { implement } from "@rest-rpc/server";
import { requestValidationContract } from "./contract.ts";

export const createRequestValidationImplementations = () => {
	const implementor = implement(requestValidationContract);

	return {
		coerce: implementor.coerce.handler((request) => ({
			id: request.params.id,
			published: request.query.published,
			page: request.headers["x-page"],
		})),
		params: implementor.params.handler(() => ({ reached: true as const })),
		query: implementor.query.handler(() => ({ reached: true as const })),
		headers: implementor.headers.handler(() => ({ reached: true as const })),
		body: implementor.body.handler(() => ({ reached: true as const })),
		emptyQuery: implementor.emptyQuery.handler((request) => ({
			value: request.query.value,
		})),
		jsonQuery: implementor.jsonQuery.handler((request) => ({
			page: request.query.page,
			includeArchived: request.query.includeArchived,
			tags: request.query.filters.tags,
		})),
	};
};
