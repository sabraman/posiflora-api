import {
	McpServer,
	ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import createClient from "openapi-fetch";
import { z } from "zod";
import type { paths } from "./client.js";
import { mapHttpStatusCodeToMcpError, openApiTypeToZod } from "./utils.js";

// Log helper
async function log(
	server: McpServer,
	level:
		| "debug"
		| "info"
		| "notice"
		| "warning"
		| "error"
		| "critical"
		| "alert"
		| "emergency",
	message: string,
	data?: unknown,
) {
	try {
		if (server.server.transport) {
			await server.server.sendLoggingMessage({
				level,
				data,
				logger: "posiflora-mcp",
			});
		}
	} catch (e) {
		// Fallback to stdio if notification fails or not connected
		// Only log to stderr to avoid interfering with stdout transport
		console.error(`[${level.toUpperCase()}] ${message}`, data);
	}
}

// Middleware helper
async function withMiddleware<T>(
	server: McpServer,
	name: string,
	args: any,
	fn: () => Promise<T>,
): Promise<T> {
	await log(server, "info", `Executing tool: ${name}`, { args });
	const start = Date.now();
	try {
		const result = await fn();
		const duration = Date.now() - start;
		await log(server, "info", `Success: ${name}`, {
			duration_ms: duration,
			result_is_error: (result as any)?.isError,
		});
		return result;
	} catch (error: any) {
		await log(server, "error", `Error in ${name}`, { error: error.message });
		throw error;
	}
}

export interface ServerOptions {
	fetch?: typeof fetch;
}

export function createPosifloraServer(
	apiKey: string | undefined,
	openApiSpec: any,
	options?: ServerOptions,
) {
	// Initialize server
	const server = new McpServer({
		name: "posiflora-api",
		version: "1.0.0",
	});

	const API_URL = openApiSpec.servers?.[0]?.url || "https://api.posiflora.com";

	// Add Resource: OpenAPI Spec (Register First)
	console.error("DEBUG: Registering openapi-spec resource...");
	server.resource(
		"openapi-spec",
		"posiflora://openapi.json",
		{
			mimeType: "application/json",
			description: "The official OpenAPI specification for the Posiflora API",
		},
		async (uri) => {
			return {
				contents: [
					{
						uri: uri.toString(),
						mimeType: "application/json",
						text: JSON.stringify(openApiSpec),
					},
				],
			};
		},
	);

	const client = createClient<paths>({
		baseUrl: API_URL,
		headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
		fetch: (input: any, init?: any) => {
			const controller = new AbortController();
			const id = setTimeout(() => controller.abort(), 30000); // 30s timeout
			const fetchFn = options?.fetch || fetch;
			return fetchFn(input, {
				...init,
				signal: controller.signal,
			}).finally(() => clearTimeout(id));
		},
	});

	// Filter configuration
	const enabledTags = process.env.POSIFLORA_ENABLED_TAGS
		? process.env.POSIFLORA_ENABLED_TAGS.split(",").map((t) => t.trim())
		: [];

	if (enabledTags.length > 0) {
		console.error(`Status: Filtering tools by tags: ${enabledTags.join(", ")}`);
	} else {
		console.error(`Status: All tools enabled (no tag filter set)`);
	}

	// Register Resources (Templates)
	// Scan for GET paths with parameters
	const registeredResourceTemplates = new Set<string>();
	const registeredResourceNames = new Set<string>();

	for (const [pathUrl, pathItem] of Object.entries(openApiSpec.paths || {})) {
		// @ts-expect-error
		const getOp = pathItem.get;
		if (getOp) {
			// Check if it has path parameters
			if (pathUrl.includes("{")) {
				// Create a resource template
				// Pattern: posiflora://{resource}/{id} -> /v1/{resource}/{id}
				// We'll map the OpenAPI path directly to a resource URI scheme
				// Remove leading slash and v1 for cleaner URIs if possible, or keep as is.
				// Let's use: posiflora://api{pathUrl}

				const resourcePath = `posiflora://api${pathUrl}`;
				if (registeredResourceTemplates.has(resourcePath)) continue;
				registeredResourceTemplates.add(resourcePath);

				// Create a more readable name from the path if operationId is missing
				let resourceName =
					getOp.operationId ||
					pathUrl
						.replace(/^\/v1\//, "")
						.replace(/\//g, "_")
						.replace(/[{}]/g, "");

				// Deduplicate name
				if (registeredResourceNames.has(resourceName)) {
					let i = 2;
					while (registeredResourceNames.has(`${resourceName}_${i}`)) {
						i++;
					}
					resourceName = `${resourceName}_${i}`;
				}
				registeredResourceNames.add(resourceName);

				server.resource(
					resourceName,
					new ResourceTemplate(resourcePath, { list: undefined }),
					{
						description:
							(getOp.summary ||
								getOp.description ||
								`Dynamic resource for ${pathUrl}.`) +
							`\n\nURI Template: ${resourcePath}`,
						mimeType: "application/json",
					},
					async (uri, variables) => {
						const params: any = { path: variables, query: {} };

						return await withMiddleware(
							server,
							`read_resource:${uri.href}`,
							params,
							async () => {
								// @ts-expect-error
								const { data, error, response } = await client.GET(pathUrl, {
									params: { path: variables },
								});

								if (error || !response.ok) {
									const status = response.status;
									const errorData = error || {
										title: "Not Found",
										detail:
											"The requested resource was not found on the server.",
									};
									const errorMsg =
										typeof errorData === "string"
											? errorData
											: JSON.stringify(errorData);

									throw new McpError(
										mapHttpStatusCodeToMcpError(status),
										`API Error (${status}): ${errorMsg}`,
									);
								}

								return {
									contents: [
										{
											uri: uri.href,
											mimeType: "application/json",
											text: JSON.stringify(data, null, 2),
										},
									],
								};
							},
						);
					},
				);
			}
		}
	}

	// Iterate over paths and register tools
	const registeredToolNames = new Set<string>();
	for (const [pathUrl, pathItem] of Object.entries(openApiSpec.paths || {})) {
		// @ts-expect-error
		for (const [method, operation] of Object.entries(pathItem)) {
			if (["parameters", "summary", "description"].includes(method)) continue;

			const op = operation as any;

			// Filtering Logic
			if (enabledTags.length > 0) {
				const opTags = op.tags || [];
				const hasEnabledTag = opTags.some((tag: string) =>
					enabledTags.includes(tag),
				);
				if (!hasEnabledTag) {
					continue;
				}
			}

			const operationId =
				op.operationId ||
				`${method}_${pathUrl.replace(/\//g, "_").replace(/[{}]/g, "")}`;
			const toolName = operationId
				.replace(/-/g, "_")
				.replace(/\s+/g, "_")
				.toLowerCase();
			// sanitize tool name (only letters, numbers, underscores)
			let safeToolName = toolName.replace(/[^a-z0-9_]/g, "_").substring(0, 64);

			let description =
				op.summary || op.description || `${method.toUpperCase()} ${pathUrl}`;

			// Extract examples for the description if present in the spec
			const examples: string[] = [];
			if (op.responses?.["200"]?.content?.["application/json"]?.example) {
				const ex = op.responses["200"].content["application/json"].example;
				examples.push(
					`Response Example: ${JSON.stringify(ex).substring(0, 200)}...`,
				);
			} else if (
				op.responses?.["201"]?.content?.["application/vnd.api+json"]?.example
			) {
				const ex =
					op.responses["201"].content["application/vnd.api+json"].example;
				examples.push(
					`Response Example: ${JSON.stringify(ex).substring(0, 200)}...`,
				);
			}

			if (examples.length > 0) {
				description += "\n\n" + examples.join("\n");
			}

			// Build Zod schema for args
			const shape: Record<string, z.ZodType<any>> = {};

			// 1. Path parameters
			const pathParams = (pathItem as any).parameters || [];
			const opParams = op.parameters || [];
			const allParams = [...pathParams, ...opParams];

			for (const param of allParams) {
				if (param.in === "path" || param.in === "query") {
					const isRequired = param.required;
					let zodSchema = openApiTypeToZod(param.schema || {}, openApiSpec);
					if (!isRequired) {
						zodSchema = zodSchema.optional();
					}
					shape[param.name] = zodSchema;
				}
			}

			// 2. Request Body
			if (op.requestBody) {
				const content =
					op.requestBody.content?.["application/json"] ||
					op.requestBody.content?.["application/vnd.api+json"];
				if (content && content.schema) {
					const zodSchema = openApiTypeToZod(content.schema, openApiSpec);
					// Unwrap optional if needed
					const baseSchema =
						zodSchema instanceof z.ZodOptional ? zodSchema.unwrap() : zodSchema;

					if (baseSchema instanceof z.ZodObject) {
						// Splat object properties into tool arguments
						Object.assign(shape, baseSchema.shape);
					} else {
						// Fallback to a single argument if not an object
						let argName = "body";
						if (content.schema.$ref) {
							argName = decodeURIComponent(
								content.schema.$ref.split("/").pop()!
									.replace(/~1/g, "/")
									.replace(/~0/g, "~"),
							);
						}
						shape[argName] = zodSchema.optional();
					}
				}
			}

			// Deduplicate tool names
			if (registeredToolNames.has(safeToolName)) {
				let i = 2;
				while (registeredToolNames.has(`${safeToolName}_${i}`)) {
					i++;
				}
				safeToolName = `${safeToolName}_${i}`;
			}
			registeredToolNames.add(safeToolName);

			server.tool(safeToolName, description, shape, async (args) => {
				// Separate args into path, query, and body
				const params: any = { query: {}, path: {}, body: {} };

				const pathStr = pathUrl;
				const pathKeys = [];
				// Find path keys
				const matches = pathUrl.match(/{([^}]+)}/g);
				if (matches) {
					for (const m of matches) {
						const key = m.slice(1, -1);
						pathKeys.push(key);
						if (args[key] !== undefined) {
							params.path[key] = args[key];
						}
					}
				}

				// Remaining args -> Query or Body?
				for (const param of allParams) {
					if (param.in === "query" && args[param.name] !== undefined) {
						params.query[param.name] = args[param.name];
					}
				}

				// Request Body handling
				if (["post", "put", "patch"].includes(method)) {
					if (op.requestBody) {
						const content =
							op.requestBody.content?.["application/json"] ||
							op.requestBody.content?.["application/vnd.api+json"];
						if (content && content.schema) {
							const zodSchema = openApiTypeToZod(content.schema, openApiSpec);
							const baseSchema =
								zodSchema instanceof z.ZodOptional
									? zodSchema.unwrap()
									: zodSchema;

							if (baseSchema instanceof z.ZodObject) {
								const bodyData: any = {};
								for (const propName of Object.keys(baseSchema.shape)) {
									if (args[propName] !== undefined) {
										bodyData[propName] = args[propName];
									}
								}
								Object.assign(params.body, bodyData);
							} else {
								let argName = "body";
								if (content.schema.$ref) {
									argName = decodeURIComponent(
										content.schema.$ref.split("/").pop()!
											.replace(/~1/g, "/")
											.replace(/~0/g, "~"),
									);
								}
								if (args[argName] !== undefined) {
									params.body = args[argName];
								}
							}
						}
					}
				}

				return await withMiddleware(server, safeToolName, args, async () => {
					// Execute
					// @ts-expect-error
					const { data, error, response } = await client[method.toUpperCase()](
						pathUrl,
						{
							params: {
								path: Object.keys(params.path).length ? params.path : undefined,
								query: Object.keys(params.query).length
									? params.query
									: undefined,
							},
							body: Object.keys(params.body).length ? params.body : undefined,
						},
					);

					if (error || !response.ok) {
						const status = response.status;
						const errorData = error || { message: "Unknown API Error" };
						const errorMsg =
							typeof errorData === "string"
								? errorData
								: JSON.stringify(errorData);

						return {
							isError: true,
							content: [
								{ type: "text", text: `API Error (${status}): ${errorMsg}` },
							],
							_errorCode: mapHttpStatusCodeToMcpError(status), // Internal hint for debugging if needed
						};
					}

					return {
						content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
					};
				});
			});
		}
	}

	// Register discovery tool: list_tags
	server.tool(
		"list_tags",
		"Lists all available API categories (tags) that can be used for filtering tools via POSIFLORA_ENABLED_TAGS environment variable.",
		{},
		async () => {
			const tags = new Set<string>();
			for (const pathItem of Object.values(openApiSpec.paths || {})) {
				for (const operation of Object.values(pathItem as any)) {
					if (typeof operation === "object" && (operation as any).tags) {
						for (const tag of (operation as any).tags) {
							tags.add(tag);
						}
					}
				}
			}
			return {
				content: [
					{
						type: "text",
						text: `Available tags for filtering:\n${Array.from(tags)
							.sort()
							.map((t) => `- ${t}`)
							.join("\n")}`,
					},
				],
			};
		},
	);

	// Register discovery tool: get_server_status
	server.tool(
		"get_server_status",
		"Shows current server configuration, including active tag filters and tool counts.",
		{},
		async () => {
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								name: "posiflora-mcp",
								version: "1.0.0",
								apiUrl: API_URL,
								activeTagFilters:
									enabledTags.length > 0 ? enabledTags : "none (all tools enabled)",
								totalToolsRegistered: registeredToolNames.size + 2, // +2 for discovery tools
								totalResourcesRegistered: registeredResourceTemplates.size + 1, // +1 for openapi-spec
								apiSpecResource: "posiflora://openapi.json",
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	return server;
}
