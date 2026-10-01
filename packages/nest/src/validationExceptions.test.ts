import {
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";
import {
	RequestValidationException,
	ResponseValidationException,
} from "./validationExceptions.ts";

describe("validationExceptions", () => {
	it("preserves request validation details and the underlying cause", () => {
		const error = new RequestValidationError({
			body: [{ message: "Invalid body" }],
			query: [],
			params: [],
			headers: [],
		});
		const exception = new RequestValidationException(error);
		expect(exception.getStatus()).toBe(400);
		expect(exception.getResponse()).toBe(error.responseBody);
		expect(exception.validationError).toBe(error);
		expect(exception.cause).toBe(error);
	});

	it("retains response validation details on the exception without exposing them in the response", () => {
		const error = new ResponseValidationError("body", [
			{ message: "Private detail" },
		]);
		const exception = new ResponseValidationException(error);
		expect(exception.getStatus()).toBe(500);
		expect(exception.getResponse()).toEqual({
			message: "Response validation failed.",
		});
		expect(exception.validationError).toBe(error);
		expect(exception.cause).toBe(error);
	});
});
