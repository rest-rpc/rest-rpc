import type { Contract, RouteDeclaration } from "@rest-rpc/core/contract";
import type { ContextShape, HandlerMethodFor } from "./routeBuilder.types.ts";

type EmptyObject = Record<never, never>;
type ContractRoute = { readonly "~restrpc": RouteDeclaration };

export type ContractImplementor<
	TContract extends Contract,
	TContext extends ContextShape = EmptyObject,
> = TContract extends ContractRoute
	? TContract & HandlerMethodFor<TContract["~restrpc"], TContext>
	: {
			readonly [TKey in keyof TContract]: ContractImplementor<
				Extract<TContract[TKey], Contract>,
				TContext
			>;
		};
