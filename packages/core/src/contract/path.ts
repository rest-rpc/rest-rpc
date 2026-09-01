const paramsegmentPattern = /^(?::([^/]+)|\{([^/]+)\})$/;

const pathParamNameFromCaptures = (
	colonName: string | undefined,
	openApiName: string | undefined,
) => {
	const name = colonName ?? openApiName;
	if (name === undefined) {
		throw new Error("Expected path param match to include a name.");
	}
	return name;
};

export const getPathParamNames = (path: string) =>
	path
		.split("/")
		.map(getparamsegmentName)
		.filter((name): name is string => name !== undefined);

export const getparamsegmentName = (segment: string) => {
	const match = paramsegmentPattern.exec(segment);
	if (!match) return undefined;
	return pathParamNameFromCaptures(match[1], match[2]);
};

export const isparamsegment = (segment: string) =>
	getparamsegmentName(segment) !== undefined;

export const replaceparams = (
	path: string,
	replace: (name: string) => string,
) =>
	path
		.split("/")
		.map((segment) => {
			const name = getparamsegmentName(segment);
			return name === undefined ? segment : replace(name);
		})
		.join("/");

export const toColonPath = (path: string) =>
	replaceparams(path, (name) => `:${name}`);

export const toOpenApiPath = (path: string) =>
	replaceparams(path, (name) => `{${name}}`);
