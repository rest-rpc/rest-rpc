import { route, webSocketMessages } from "@rest-rpc/core/contract";
import z from "zod";

const clientMessages = webSocketMessages("action", {
	echo: z.object({
		text: z.string(),
	}),
	fail: z.undefined(),
	close: z.undefined(),
});

const serverMessages = {
	discriminator: "type",
	schemas: {
		welcome: z.object({
			roomId: z.string(),
			mode: z.enum(["fast", "slow"]),
			adapter: z.string(),
		}),
		echo: z.object({
			text: z.string(),
			roomId: z.string(),
			mode: z.enum(["fast", "slow"]),
		}),
	},
} as const;

const room = route
	.ws("/ws/:roomId")
	.params(
		z.object({
			roomId: z.string().min(1),
		}),
	)
	.query(
		z.object({
			mode: z.enum(["fast", "slow"]),
		}),
	)
	.clientMessages(clientMessages)
	.serverMessages(serverMessages);

export const websocketContract = { room } as const;

export type WebSocketContract = typeof websocketContract;
