import { after, describe, it } from "node:test";
import { Controller, Inject, Injectable, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
	route as contractRoute,
	router as contractRouter,
	noBody,
	type as schemaType,
} from "@rest-rpc/core/contract";
import "reflect-metadata";
import request from "supertest";
import {
	RestRpcModule,
	Route,
	type RouteHandlers,
	type RouteRequest,
	Router,
	route,
	router,
} from "./index.ts";

const api = contractRouter({
	todos: {
		get: contractRoute({
			method: "GET",
			path: "/todos/:id",
			response: schemaType<{ id: string; userId?: string }>(),
		}),
		delete: contractRoute({
			method: "DELETE",
			path: "/todos/:id",
			responses: {
				204: noBody(),
			},
		}),
	},
	classTodos: {
		get: contractRoute({
			method: "GET",
			path: "/class-todos/:id",
			response: schemaType<{ id: string; owner?: string }>(),
		}),
	},
	routerTodos: {
		get: contractRoute({
			method: "GET",
			path: "/router-todos/:id",
			response: schemaType<{ id: string }>(),
		}),
		delete: contractRoute({
			method: "DELETE",
			path: "/router-todos/:id",
			responses: {
				204: noBody(),
			},
		}),
	},
});

describe("Nest route decorator", () => {
	let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;

	after(async () => {
		await app?.close();
	});

	it("executes a returned route implementation through Nest routing", async () => {
		type AppContext = { userId?: string };

		class TodoRoutes {
			private readonly userPrefix: string;

			constructor(userPrefix = "") {
				this.userPrefix = userPrefix;
			}

			getTodo() {
				return route<typeof api.todos.get, AppContext>(
					api.todos.get,
					async ({ id, context }) => ({
						id: `${this.userPrefix}${id}`,
						userId: context.userId,
					}),
				);
			}
		}

		@Controller()
		class TodosController {
			private readonly routes = new TodoRoutes();

			@Route(api.todos.get)
			getTodo() {
				return this.routes.getTodo();
			}

			@Route(api.todos.delete)
			deleteTodo() {
				return route(api.todos.delete, async () => undefined);
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
							userId: String(req.headers["x-user-id"] ?? "") || undefined,
						};
					},
				}),
			],
			controllers: [TodosController],
		})
		class AppModule {}

		app = await NestFactory.create(AppModule, { logger: false });
		await app.init();

		await request(app.getHttpServer())
			.get("/todos/123")
			.set("x-user-id", "user-1")
			.expect(200, { id: "123", userId: "user-1" });

		await request(app.getHttpServer()).delete("/todos/123").expect(204);
	});

	it("rejects a controller method that returns a different route implementation", async () => {
		@Controller()
		class BadController {
			@Route(api.todos.get)
			getTodo() {
				return route(api.todos.delete, async () => undefined);
			}
		}

		@Module({
			imports: [RestRpcModule.forRoot()],
			controllers: [BadController],
		})
		class BadModule {}

		app = await NestFactory.create(BadModule, { logger: false });
		await app.init();

		await request(app.getHttpServer()).get("/todos/123").expect(500);
	});

	it("supports a class handler model through a one-route router subtree", async () => {
		type AppContext = { owner?: string };

		@Injectable()
		class ClassTodoService {
			formatId(id: string) {
				return `service:class:${id}`;
			}
		}

		@Injectable()
		class ClassTodoRoutes
			implements RouteHandlers<typeof api.classTodos, AppContext>
		{
			private readonly todos: ClassTodoService;

			constructor(@Inject(ClassTodoService) todos: ClassTodoService) {
				this.todos = todos;
			}

			get({
				id,
				context,
			}: RouteRequest<typeof api.classTodos.get, AppContext>) {
				return {
					id: this.todos.formatId(id),
					owner: context.owner,
				};
			}
		}

		@Controller()
		class ClassTodosController {
			private readonly routes: ClassTodoRoutes;

			constructor(@Inject(ClassTodoRoutes) routes: ClassTodoRoutes) {
				this.routes = routes;
			}

			@Route(api.classTodos.get)
			getTodo() {
				return router<typeof api.classTodos, AppContext>(
					api.classTodos,
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
							owner: String(req.headers["x-owner"] ?? "") || undefined,
						};
					},
				}),
			],
			controllers: [ClassTodosController],
			providers: [ClassTodoRoutes, ClassTodoService],
		})
		class AppModule {}

		app = await NestFactory.create(AppModule, { logger: false });
		await app.init();

		await request(app.getHttpServer())
			.get("/class-todos/123")
			.set("x-owner", "nest")
			.expect(200, { id: "service:class:123", owner: "nest" });
	});

	it("binds every HTTP route in a contract router to one controller method", async () => {
		@Controller()
		class RouterTodosController {
			@Router(api.routerTodos)
			todos() {
				return router(api.routerTodos, {
					get: ({ id }) => ({ id: `router:${id}` }),
					delete: () => undefined,
				});
			}
		}

		@Module({
			imports: [RestRpcModule.forRoot()],
			controllers: [RouterTodosController],
		})
		class AppModule {}

		app = await NestFactory.create(AppModule, { logger: false });
		await app.init();

		await request(app.getHttpServer())
			.get("/router-todos/123")
			.expect(200, { id: "router:123" });

		await request(app.getHttpServer()).delete("/router-todos/123").expect(204);
	});
});
