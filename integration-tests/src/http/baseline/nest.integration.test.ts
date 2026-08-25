import assert from "node:assert/strict";
import { after, it } from "node:test";
import { Controller, Inject, Injectable, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { initClient } from "@rest-rpc/core";
import {
	route as contractRoute,
	router as contractRouter,
	type as schemaType,
} from "@rest-rpc/core/contract";
import {
	RestRpcModule,
	Route,
	type RouteHandlers,
	type RouteRequest,
	router,
} from "@rest-rpc/nest";
import "reflect-metadata";
import { createNestAdapter } from "../harness/nest.ts";
import { integrationContract } from "./contract.ts";
import { createIntegrationHandlers } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(
	createNestAdapter(integrationContract, createIntegrationHandlers()),
);

it("combines Nest controller prefixes with contract route paths", async () => {
	const server = await createNestAdapter(
		integrationContract,
		createIntegrationHandlers(),
		{ controllerPrefix: "api/v1" },
	).start();

	try {
		const client = initClient(integrationContract, {
			baseUrl: `${server.origin}/api/v1`,
		});

		assert.equal(await client.health.fetch(), undefined);
		assert.equal((await fetch(`${server.origin}/api/v1/health`)).status, 204);
		assert.equal((await fetch(`${server.origin}/health`)).status, 404);
	} finally {
		await server.close();
	}
});

it("registers router routes whose contract key paths would produce the same flattened name", async () => {
	const collisionContract = contractRouter({
		a_b: contractRoute({
			method: "GET",
			path: "/flat",
			response: schemaType<{ source: string }>(),
		}),
		a: {
			b: contractRoute({
				method: "GET",
				path: "/nested",
				response: schemaType<{ source: string }>(),
			}),
		},
	});
	const server = await createNestAdapter(collisionContract, {
		a_b: () => ({ source: "flat" }),
		a: {
			b: () => ({ source: "nested" }),
		},
	}).start();

	try {
		const client = initClient(collisionContract, { baseUrl: server.origin });

		assert.deepEqual(await client.a_b.fetch(), { source: "flat" });
		assert.deepEqual(await client.a.b.fetch(), { source: "nested" });
	} finally {
		await server.close();
	}
});

const classContract = contractRouter({
	items: {
		get: contractRoute({
			method: "GET",
			path: "/class-items/:id",
			response: schemaType<{ id: string; title: string }>(),
		}),
	},
});

it("serves a contract route implemented by a Nest provider class", async () => {
	type AppContext = {
		source: string;
	};

	@Injectable()
	class ItemService {
		formatTitle(source: string, id: string) {
			return `${source}:service:class:${id}`;
		}
	}

	@Injectable()
	class ItemRoutes
		implements RouteHandlers<typeof classContract.items, AppContext>
	{
		constructor(@Inject(ItemService) private readonly items: ItemService) {}

		get({
			id,
			context,
		}: RouteRequest<typeof classContract.items.get, AppContext>) {
			return {
				id,
				title: this.items.formatTitle(context.source, id),
			};
		}
	}

	@Controller()
	class ItemsController {
		constructor(@Inject(ItemRoutes) private readonly routes: ItemRoutes) {}

		@Route(classContract.items.get)
		getItem() {
			return router<typeof classContract.items, AppContext>(
				classContract.items,
				this.routes,
			).get;
		}
	}

	@Module({
		imports: [
			RestRpcModule.forRoot({
				createContext: (context) => {
					const req = context
						.switchToHttp()
						.getRequest<{ headers: Record<string, unknown> }>();
					return {
						source: String(req.headers["x-test-source"] ?? "nest"),
					};
				},
			}),
		],
		controllers: [ItemsController],
		providers: [ItemRoutes, ItemService],
	})
	class AppModule {}

	const app = await NestFactory.create(AppModule, { logger: false });
	after(async () => {
		await app.close();
	});

	await app.listen(0, "127.0.0.1");
	const response = await fetch(`${await app.getUrl()}/class-items/item-1`, {
		headers: {
			"x-test-source": "provider",
		},
	});

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		id: "item-1",
		title: "provider:service:class:item-1",
	});
});
