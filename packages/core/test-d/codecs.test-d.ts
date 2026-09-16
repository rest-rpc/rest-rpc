import type { IncomingMessage } from "node:http";
import type {
	BodyCodec,
	BodyDeserializer,
	BodySerializer,
	SerializedBody,
} from "@rest-rpc/core";
import {
	defaultBodyCodecs,
	deserializeBody,
	resolveBodyDeserializer,
	serializeBody,
} from "@rest-rpc/core/codecs";
import { expectAssignable, expectError, expectType } from "tsd";

expectAssignable<BodyCodec<Response>>({ match: () => true });
expectAssignable<SerializedBody>({
	body: { native: true },
	headers: { count: 1, optional: undefined },
});
expectAssignable<BodySerializer>(() => ({ body: new Uint8Array([1]) }));
expectAssignable<BodyDeserializer<IncomingMessage>>(
	(request) => request.headers,
);
expectAssignable<readonly BodyCodec<Response>[]>(defaultBodyCodecs);
const native: BodyCodec<IncomingMessage> = {
	match: () => true,
	deserialize: (request) => request.headers,
};
expectType<BodyDeserializer<IncomingMessage> | undefined>(
	resolveBodyDeserializer("application/json", [native]),
);
expectError(deserializeBody(new Response(), [native]));
expectType<Promise<unknown>>(deserializeBody(new Response()));
expectType<Promise<SerializedBody>>(serializeBody({}, "application/json"));
