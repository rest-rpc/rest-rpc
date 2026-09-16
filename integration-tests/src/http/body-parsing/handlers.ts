import { implement } from "@rest-rpc/server";
import {
	bodyParsingContract,
	frameworkBodyParsingContract,
} from "./contract.ts";

export const createBodyParsingImplementations = () => {
	const implementor = implement(bodyParsingContract);

	return {
		json: implementor.json.handler((request) => ({
			status: 200,
			body: {
				count: request.body.count,
				title: request.body.title,
			},
		})),
		text: implementor.text.handler((request) => ({
			status: 200,
			body: { body: request.body },
		})),
		textVariant: implementor.textVariant.handler((request) => ({
			status: 200,
			body: {
				body: request.body,
			},
		})),
		customJson: implementor.customJson.handler((request) => ({
			status: 200,
			body: {
				count: request.body.count,
				ok: request.body.nested.ok,
			},
		})),
		formUrlEncoded: implementor.formUrlEncoded.handler((request) => ({
			status: 200,
			body: {
				count: request.body.get("count")!,
				title: request.body.get("title")!,
				filters: request.query.filters,
				tags: request.body.has("tags")
					? request.body.getAll("tags")
					: undefined,
			},
		})),
		binary: implementor.binary.handler(async (request) => ({
			status: 200,
			body: {
				byteLength: request.body.size,
				bytes: Array.from(new Uint8Array(await request.body.arrayBuffer())),
			},
		})),
		deleteNoBody: implementor.deleteNoBody.handler(() => ({ status: 204 })),
	};
};

export const createFrameworkBodyParsingImplementations = () => ({
	...createBodyParsingImplementations(),
	binary: implement(frameworkBodyParsingContract).binary.handler((request) => ({
		status: 200,
		body: {
			byteLength: request.body.byteLength,
			bytes: Array.from(request.body),
		},
	})),
});
