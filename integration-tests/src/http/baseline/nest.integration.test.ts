import assert from "node:assert/strict";
import { after, it } from "node:test";
import { Controller, Inject, Injectable, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
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
	Router,
	route,
	router,
} from "@rest-rpc/nest";
import "reflect-metadata";
import { integrationContract } from "./contract.ts";

const classContract = contractRouter({
	items: {
		get: contractRoute({
			method: "GET",
			path: "/class-items/:id",
			response: schemaType<{ id: string; title: string }>(),
		}),
	},
});

it("serves a contract route through a Nest controller", async () => {
	type AppContext = {
		source: string;
	};

	@Controller()
	class ItemsController {
		@Route(integrationContract.items.get)
		getItem() {
			return route<typeof integrationContract.items.get, AppContext>(
				integrationContract.items.get,
				async ({ id, context }) => {
					return {
						id,
						title: `${context.source}:${id}`,
					};
				},
			);
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
	})
	class AppModule {}

	const app = await NestFactory.create(AppModule, { logger: false });
	after(async () => {
		await app.close();
	});

	await app.listen(0, "127.0.0.1");
	const response = await fetch(`${await app.getUrl()}/items/item-1`, {
		headers: {
			"x-test-source": "controller",
		},
	});

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		id: "item-1",
		title: "controller:item-1",
	});
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
		private readonly items: ItemService;

		constructor(@Inject(ItemService) items: ItemService) {
			this.items = items;
		}

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
		private readonly routes: ItemRoutes;

		constructor(@Inject(ItemRoutes) routes: ItemRoutes) {
			this.routes = routes;
		}

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

it("serves a contract router through one Nest controller method", async () => {
	@Injectable()
	class InjectableService {
		formatTitle(id: string) {
			return `service:${id}`;
		}
	}
	@Injectable()
	class ItemsService
		implements RouteHandlers<typeof integrationContract.items>
	{
		constructor(
			@Inject(InjectableService) private readonly service: InjectableService,
		) {}

		list({
			search,
			empty,
		}: RouteRequest<typeof integrationContract.items.list>) {
			return [
				{ id: "item-1", title: search ?? "First item" },
				{ id: "item-2", title: empty ?? "Second item" },
			];
		}

		get({ id }: RouteRequest<typeof integrationContract.items.get>) {
			return { id, title: this.service.formatTitle(id) };
		}

		create({ title }: RouteRequest<typeof integrationContract.items.create>) {
			return {
				status: 201 as const,
				body: { id: "created-item", title },
			};
		}

		publish({
			id,
			async,
		}: RouteRequest<typeof integrationContract.items.publish>) {
			return async
				? {
						status: 202 as const,
						body: { queued: true as const, id },
					}
				: {
						status: 200 as const,
						body: { id, title: "Published item" },
					};
		}

		remove() {
			return undefined;
		}
	}

	@Controller()
	class ItemsController {
		private readonly itemsService: ItemsService;

		constructor(@Inject(ItemsService) items: ItemsService) {
			this.itemsService = items;
		}

		@Router(integrationContract.items)
		items() {
			return router(integrationContract.items, this.itemsService);
		}
	}

	@Module({
		imports: [RestRpcModule.forRoot()],
		controllers: [ItemsController],
		providers: [InjectableService, ItemsService],
	})
	class AppModule {}

	const app = await NestFactory.create(AppModule, { logger: false });
	after(async () => {
		await app.close();
	});

	await app.listen(0, "127.0.0.1");

	const getResponse = await fetch(`${await app.getUrl()}/items/item-1`);
	assert.equal(getResponse.status, 200);
	assert.deepEqual(await getResponse.json(), {
		id: "item-1",
		title: "service:item-1",
	});

	const deleteResponse = await fetch(`${await app.getUrl()}/items/item-1`, {
		method: "DELETE",
	});
	assert.equal(deleteResponse.status, 204);
});
