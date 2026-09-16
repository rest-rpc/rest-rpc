import type { NextFunction, Request, Response } from "express";
import express from "express";
import { createNestAdapter } from "../harness/nest.ts";
import { frameworkBodyParsingContract } from "./contract.ts";
import { createFrameworkBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

runBodyParsingSuite(
	createNestAdapter(
		frameworkBodyParsingContract,
		createFrameworkBodyParsingImplementations(),
		{
			configureApp: (app) => {
				app.use(
					frameworkBodyParsingContract.binary["~restrpc"].path,
					express.raw({ type: "application/octet-stream" }),
				);
				app.use(
					frameworkBodyParsingContract.text["~restrpc"].path,
					express.text({ type: "text/plain" }),
				);
				app.use(
					frameworkBodyParsingContract.textVariant["~restrpc"].path,
					express.text({
						type: ["text/plain", "text/markdown", "application/xml"],
					}),
				);
				app.use(
					frameworkBodyParsingContract.json["~restrpc"].path,
					express.json({ type: "application/json" }),
				);
				app.use(
					frameworkBodyParsingContract.customJson["~restrpc"].path,
					express.json({ type: "application/json" }),
				);
				app.use(
					frameworkBodyParsingContract.formUrlEncoded["~restrpc"].path,
					express.text({ type: "application/x-www-form-urlencoded" }),
					(req: Request, _res: Response, next: NextFunction) => {
						req.body = new URLSearchParams(req.body);
						next();
					},
				);
			},
		},
	),
);
