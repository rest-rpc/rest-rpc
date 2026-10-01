import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { route, type } from "@rest-rpc/core";
import { Implement, REST_RPC_ROUTE_METADATA } from "./decorators.ts";

describe("decorators", () => {
	it("creates methods for nested routes while preserving controller binding and metadata", async () => {
		const contract = { users: { get: route.get("/users/{id}").response(204) } };
		const implementation = { marker: "implementation" };
		class Controller {
			value = implementation;
			async routes(prefix: string) {
				expect(prefix).toBe("argument");
				return { users: { get: this.value } };
			}
		}
		const original = Controller.prototype.routes;
		Reflect.defineMetadata("guard", "guard-value", original);
		Reflect.defineMetadata("arguments", "argument-value", Controller, "routes");
		Implement(contract)(
			Controller.prototype,
			"routes",
			Object.getOwnPropertyDescriptor(Controller.prototype, "routes")!,
		);
		const methodName = Object.getOwnPropertyNames(Controller.prototype).find(
			(name) => name.startsWith("__restRpcImplement_"),
		)!;
		const method = (
			Controller.prototype as unknown as Record<
				string,
				(...args: unknown[]) => unknown
			>
		)[methodName]!;
		expect(Reflect.getMetadata(PATH_METADATA, method)).toBe("/users/:id");
		expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(
			RequestMethod.GET,
		);
		expect(
			Reflect.getMetadata(REST_RPC_ROUTE_METADATA, method).route.path,
		).toBe("/users/{id}");
		expect(Reflect.getMetadata("guard", method)).toBe("guard-value");
		expect(Reflect.getMetadata("arguments", Controller, methodName)).toBe(
			"argument-value",
		);
		expect(await method.call(new Controller(), "argument")).toBe(
			implementation,
		);
	});

	it("rejects a root procedure because it has no tree-derived path", () => {
		class Controller {
			routes() {}
		}
		const procedure = route.output(type<string>());
		expect(() =>
			Implement(procedure)(
				Controller.prototype,
				"routes",
				Object.getOwnPropertyDescriptor(Controller.prototype, "routes")!,
			),
		).toThrow("requires a procedure to be part of a route tree");
	});
});
