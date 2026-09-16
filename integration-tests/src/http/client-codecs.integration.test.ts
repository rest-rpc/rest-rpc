import assert from "node:assert/strict";
import { createServer } from "node:http";
import { it } from "node:test";
import { initClient, route } from "@rest-rpc/core";
import { z } from "zod";

it("round trips Fetch client default codecs over HTTP independently of adapter parsing", async () => {
	const server = createServer(async (request, response) => {
		const chunks: Buffer[] = [];
		for await (const chunk of request) chunks.push(Buffer.from(chunk));
		response.setHeader("content-type", request.headers["content-type"]!);
		response.end(Buffer.concat(chunks));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		const api = {
			json: route
				.post("/json")
				.body(z.object({ title: z.string() }))
				.response(200, z.object({ title: z.string() })),
			form: route
				.post("/form")
				.body(z.instanceof(URLSearchParams), {
					contentType: "application/x-www-form-urlencoded",
				})
				.response(200, z.instanceof(URLSearchParams), {
					contentType: "application/x-www-form-urlencoded",
				}),
			multipart: route
				.post("/multipart")
				.body(z.instanceof(FormData), { contentType: "multipart/form-data" })
				.response(200, z.instanceof(FormData), {
					contentType: "multipart/form-data",
				}),
			binary: route
				.post("/binary")
				.body(z.instanceof(Blob), { contentType: "application/octet-stream" })
				.response(200, z.instanceof(Blob), {
					contentType: "application/octet-stream",
				}),
		};
		const client = initClient(api, {
			baseUrl: `http://127.0.0.1:${address.port}`,
			validateResponses: true,
		});
		assert.deepEqual((await client.json({ body: { title: "Hello" } })).body, {
			title: "Hello",
		});
		const form = new URLSearchParams([
			["body", "contents"],
			["tag", "a"],
			["tag", "b"],
		]);
		assert.equal(
			(await client.form({ body: form })).body.toString(),
			form.toString(),
		);
		const multipart = new FormData();
		multipart.append(
			"file",
			new File(["contents"], "hello.txt", { type: "text/plain" }),
		);
		multipart.append("tag", "a");
		multipart.append("tag", "b");
		const upload = await client.multipart({ body: multipart });
		assert.match(upload.headers.get("content-type")!, /boundary=/);
		assert.deepEqual(upload.body.getAll("tag"), ["a", "b"]);
		const file = upload.body.get("file");
		assert.ok(file instanceof File);
		assert.equal(file.name, "hello.txt");
		assert.equal(await file.text(), "contents");
		const bytes = new Uint8Array([0, 1, 127, 128, 255]);
		assert.deepEqual(
			new Uint8Array(
				await (
					await client.binary({ body: new Blob([bytes]) })
				).body.arrayBuffer(),
			),
			bytes,
		);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});
