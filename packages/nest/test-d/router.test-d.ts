import { Controller, type ExecutionContext } from "@nestjs/common";
import {
	route as defineRoute,
	router as defineRouter,
	noBody,
	type as schemaType,
} from "@rest-rpc/core/contract";
import {
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
	request: Request;
	userId: string;
};

declare module "@rest-rpc/nest" {
	interface DefaultNestContext extends AppContext {}
}

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

type GetTodoRequest = RouteRequest<typeof api.todos.get>;
declare const getTodoRequest: GetTodoRequest;
expectType<string>(getTodoRequest.id);
expectType<string>(getTodoRequest.context.userId);
expectType<Request>(getTodoRequest.context.request);
expectAssignable<AbortSignal>(getTodoRequest.context.signal);

const getTodoHandler: RouteHandler<typeof api.todos.get> = ({
	id,
	context,
}) => {
	expectType<string>(id);
	expectType<string>(context.userId);
	expectType<Request>(context.request);
	expectAssignable<AbortSignal>(context.signal);

	return {
		id,
		title: "Typed todo",
		userId: context.userId,
	};
};

const getTodoImplementation = route(api.todos.get, getTodoHandler);
expectType<typeof api.todos.get>(getTodoImplementation.route);

route(api.todos.get, ({ id, context }) => {
	expectType<string>(id);
	expectType<Request>(context.request);
	expectType<string>(context.request.path);

	return {
		id,
		title: "Express todo",
		userId: context.userId,
	};
});

expectError(
	route(api.todos.get, ({ id, context }) => ({
		id,
		title: context.userId,
	})),
);

const createTodoImplementation = route(
	api.todos.create,
	({ title, context }) => {
		expectType<string>(title);
		expectType<Request>(context.request);
		expectType<string>(context.userId);
		expectAssignable<AbortSignal>(context.signal);

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
	get({ id, context }: RouteRequest<typeof api.todos.get>) {
		return {
			id,
			title: "From class",
			userId: context.userId,
		};
	}

	create({ title, context }: RouteRequest<typeof api.todos.create>) {
		return {
			status: 201 as const,
			body: {
				id: "todo-1",
				title,
				userId: context.userId,
			},
		};
	}

	remove({ id }: RouteRequest<typeof api.todos.remove>) {
		expectType<string>(id);
		return undefined;
	}
}

const todoRoutes = new TodoRoutes();
const todoImplementations = router(api.todos, todoRoutes);
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
		return route(api.todos.get, getTodoHandler);
	}

	@Router(api.todos)
	todos() {
		return router(api.todos, todoRoutes);
	}
}

RestRpcModule.forRoot({
	createContext: (context) => {
		expectType<ExecutionContext>(context);
		const req = context.switchToHttp().getRequest<Request>();

		return {
			request: req,
			userId: "user-1",
		};
	},
});

RestRpcModule.forRoot<{
	response: Response;
}>({
	createContext: (context) => {
		const res = context.switchToHttp().getResponse<Response>();

		return {
			response: res,
		};
	},
});

new TodoController();
