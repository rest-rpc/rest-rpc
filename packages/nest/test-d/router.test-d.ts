import { Controller } from "@nestjs/common";
import {
	route as defineRoute,
	router as defineRouter,
	noBody,
	type as schemaType,
} from "@rest-rpc/core/contract";
import {
	initNest,
	RestRpcModule,
	Route,
	type RouteHandler,
	type RouteHandlers,
	type RouteRequest,
	Router,
	route,
	router,
} from "@rest-rpc/nest";
import type { Request, Response } from "express";
import { expectAssignable, expectError, expectType } from "tsd";

type AppContext = {
	userId: string;
};

const nest = initNest<AppContext>();
const expressNest = initNest<AppContext, Request, Response>();

const todoSchema = schemaType<{ id: string; title: string; userId: string }>();

const api = defineRouter({
	todos: {
		get: defineRoute({
			method: "GET",
			path: "/todos/:id",
			pathParams: {
				id: schemaType<string>(),
			},
			responses: {
				200: todoSchema,
			},
		}),
		create: defineRoute({
			method: "POST",
			path: "/todos",
			body: {
				title: schemaType<string>(),
			},
			responses: {
				201: todoSchema,
			},
		}),
		remove: defineRoute({
			method: "DELETE",
			path: "/todos/:id",
			pathParams: {
				id: schemaType<string>(),
			},
			responses: {
				204: noBody(),
			},
		}),
	},
});

type GetTodoRequest = RouteRequest<typeof api.todos.get, AppContext>;
declare const getTodoRequest: GetTodoRequest;
expectType<string>(getTodoRequest.id);
expectType<string>(getTodoRequest.context.userId);
expectAssignable<AbortSignal>(getTodoRequest.context.signal);
expectType<unknown>(getTodoRequest.context.req);
expectType<unknown>(getTodoRequest.context.res);

const getTodoHandler: RouteHandler<typeof api.todos.get, AppContext> = ({
	id,
	context,
}) => {
	expectType<string>(id);
	expectType<string>(context.userId);
	expectAssignable<AbortSignal>(context.signal);

	return {
		id,
		title: "Typed todo",
		userId: context.userId,
	};
};

const getTodoImplementation = nest.route(api.todos.get, getTodoHandler);
expectType<typeof api.todos.get>(getTodoImplementation.route);

expressNest.route(api.todos.get, ({ id, context }) => {
	expectType<string>(id);
	expectType<Request>(context.req);
	expectType<Response>(context.res);
	expectType<string>(context.req.path);
	expectType<number>(context.res.statusCode);

	return {
		id,
		title: "Express todo",
		userId: context.userId,
	};
});

expectError(
	nest.route(api.todos.get, ({ id, context }) => ({
		id,
		title: context.userId,
	})),
);

const createTodoImplementation = route(
	api.todos.create,
	({ title, context }) => {
		expectType<string>(title);
		expectType<
			Record<never, never> & { req: unknown; res: unknown; signal: AbortSignal }
		>(context);

		return {
			status: 201 as const,
			body: {
				id: "todo-1",
				title,
				userId: "default",
			},
		};
	},
);
expectType<typeof api.todos.create>(createTodoImplementation.route);

class TodoRoutes implements RouteHandlers<typeof api.todos> {
	get({ id, context }: RouteRequest<typeof api.todos.get, AppContext>) {
		return {
			id,
			title: "From class",
			userId: context.userId,
		};
	}

	create({
		title,
		context,
	}: RouteRequest<typeof api.todos.create, AppContext>) {
		return {
			status: 201 as const,
			body: {
				id: "todo-1",
				title,
				userId: context.userId,
			},
		};
	}

	remove({ id }: RouteRequest<typeof api.todos.remove, AppContext>) {
		expectType<string>(id);
		return undefined;
	}
}

const todoRoutes = new TodoRoutes();
const todoImplementations = nest.router(api.todos, todoRoutes);
expectType<typeof api.todos.get>(todoImplementations.get.route);
expectType<typeof api.todos.create>(todoImplementations.create.route);
expectType<typeof api.todos.remove>(todoImplementations.remove.route);

router(api.todos, {
	get: ({ id }) => ({
		id,
		title: "Inline router",
		userId: "default",
	}),
	create: ({ title }) => ({
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
			userId: "default",
		},
	}),
	remove: () => undefined,
});

expectError(
	router(api.todos, {
		get: ({ id }) => ({
			id,
			title: "Missing handlers",
			userId: "default",
		}),
	}),
);

expectAssignable<MethodDecorator>(Route(api.todos.get));
expectAssignable<MethodDecorator>(Router(api.todos));

@Controller()
class TodoController {
	@Route(api.todos.get)
	get() {
		return nest.route(api.todos.get, getTodoHandler);
	}

	@Router(api.todos)
	todos() {
		return nest.router(api.todos, todoRoutes);
	}
}

RestRpcModule.forRoot<AppContext>({
	createContext: ({ req, res, signal }) => {
		expectType<unknown>(req);
		expectType<unknown>(res);
		expectAssignable<AbortSignal>(signal);

		return {
			userId: "user-1",
		};
	},
});

RestRpcModule.forRoot<AppContext, Request, Response>({
	createContext: ({ req, res, signal }) => {
		expectType<Request>(req);
		expectType<Response>(res);
		expectAssignable<AbortSignal>(signal);

		return {
			userId: req.header("x-user-id") ?? String(res.statusCode),
		};
	},
});

new TodoController();
