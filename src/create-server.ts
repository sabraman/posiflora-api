import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import createClient from "openapi-fetch";
import type { paths } from "./client.js";
import { z } from "zod";
import { openApiTypeToZod } from "./utils.js";

// Log helper
async function log(server: McpServer, level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency", message: string, data?: unknown) {
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
async function withMiddleware<T>(server: McpServer, name: string, args: any, fn: () => Promise<T>): Promise<T> {
    await log(server, "info", `Executing tool: ${name}`, { args });
    const start = Date.now();
    try {
        const result = await fn();
        const duration = Date.now() - start;
        await log(server, "info", `Success: ${name}`, { duration_ms: duration });
        return result;
    } catch (error: any) {
        await log(server, "error", `Error in ${name}`, { error: error.message });
        throw error;
    }
}

export interface ServerOptions {
    fetch?: typeof fetch;
}

export function createPosifloraServer(apiKey: string | undefined, openApiSpec: any, options?: ServerOptions) {
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
            description: "The official OpenAPI specification for the Posiflora API"
        },
        async (uri) => {
            return {
                contents: [{
                    uri: uri.toString(),
                    mimeType: "application/json",
                    text: JSON.stringify(openApiSpec)
                }]
            }
        }
    );

    // @ts-ignore
    const client = createClient<paths>({
        baseUrl: API_URL,
        headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : undefined,
        fetch: options?.fetch
    });

    // Filter configuration
    const enabledTags = process.env.POSIFLORA_ENABLED_TAGS
        ? process.env.POSIFLORA_ENABLED_TAGS.split(',').map(t => t.trim())
        : [];

    if (enabledTags.length > 0) {
        console.error(`Status: Filtering tools by tags: ${enabledTags.join(', ')}`);
    } else {
        console.error(`Status: All tools enabled (no tag filter set)`);
    }

    // Register Resources (Templates)
    // Scan for GET paths with parameters
    const registeredResourceTemplates = new Set<string>();
    const registeredResourceNames = new Set<string>();

    for (const [pathUrl, pathItem] of Object.entries(openApiSpec.paths || {})) {
        // @ts-ignore
        const getOp = pathItem.get;
        if (getOp) {
            // Check if it has path parameters
            if (pathUrl.includes('{')) {
                // Create a resource template
                // Pattern: posiflora://{resource}/{id} -> /v1/{resource}/{id}
                // We'll map the OpenAPI path directly to a resource URI scheme
                // Remove leading slash and v1 for cleaner URIs if possible, or keep as is.
                // Let's use: posiflora://api{pathUrl}

                const resourcePath = `posiflora://api${pathUrl}`;
                if (registeredResourceTemplates.has(resourcePath)) continue;
                registeredResourceTemplates.add(resourcePath);

                let resourceName = getOp.operationId || `read_${pathUrl}`;
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
                        description: getOp.summary || getOp.description || `Read resource at ${pathUrl}`,
                        mimeType: "application/json"
                    },
                    async (uri, variables) => {
                        const params: any = { path: variables, query: {} };

                        return await withMiddleware(server, `read_resource:${uri.href}`, params, async () => {
                            // @ts-ignore
                            const { data, error, response } = await client.GET(pathUrl, {
                                params: { path: variables }
                            });

                            if (error) {
                                const status = (response as any)?.status || 500;
                                throw new McpError(ErrorCode.InternalError, `Resource Error (${status}): ${JSON.stringify(error)}`);
                            }


                            return {
                                contents: [{
                                    uri: uri.href,
                                    mimeType: "application/json",
                                    text: JSON.stringify(data, null, 2)
                                }]
                            };
                        });
                    }
                );
            }
        }
    }


    // Iterate over paths and register tools
    const registeredToolNames = new Set<string>();
    for (const [pathUrl, pathItem] of Object.entries(openApiSpec.paths || {})) {
        // @ts-ignore
        for (const [method, operation] of Object.entries(pathItem)) {
            if (['parameters', 'summary', 'description'].includes(method)) continue;

            const op = operation as any;

            // Filtering Logic
            if (enabledTags.length > 0) {
                const opTags = op.tags || [];
                const hasEnabledTag = opTags.some((tag: string) => enabledTags.includes(tag));
                if (!hasEnabledTag) {
                    continue;
                }
            }

            const operationId = op.operationId || `${method}_${pathUrl.replace(/\//g, '_').replace(/[{}]/g, '')}`;
            const toolName = operationId.replace(/-/g, '_').replace(/\s+/g, '_').toLowerCase();
            // sanitize tool name (only letters, numbers, underscores)
            let safeToolName = toolName.replace(/[^a-z0-9_]/g, '_').substring(0, 64);

            const description = op.summary || op.description || `${method.toUpperCase()} ${pathUrl}`;

            // Build Zod schema for args
            const shape: Record<string, z.ZodType<any>> = {};

            // 1. Path parameters
            const pathParams = (pathItem as any).parameters || [];
            const opParams = op.parameters || [];
            const allParams = [...pathParams, ...opParams];

            for (const param of allParams) {
                if (param.in === 'path' || param.in === 'query') {
                    const isRequired = param.required;
                    let zodSchema = openApiTypeToZod(param.schema || {});
                    if (!isRequired) {
                        zodSchema = zodSchema.optional();
                    }
                    shape[param.name] = zodSchema;
                }
            }

            // 2. Request Body
            if (op.requestBody) {
                const content = op.requestBody.content?.['application/json'] || op.requestBody.content?.['application/vnd.api+json'];
                if (content && content.schema) {
                    if (content.schema.type === 'object' && content.schema.properties) {
                        for (const [propName, propSchema] of Object.entries(content.schema.properties)) {
                            if (!shape[propName]) {
                                // @ts-ignore
                                shape[propName] = openApiTypeToZod(propSchema).optional();
                            }
                        }
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

            server.tool(
                safeToolName,
                description,
                shape,
                async (args) => {
                    // Separate args into path, query, and body
                    const params: any = { query: {}, path: {}, body: {} };

                    let pathStr = pathUrl;
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
                        if (param.in === 'query' && args[param.name] !== undefined) {
                            params.query[param.name] = args[param.name];
                        }
                    }

                    // Request Body handling
                    if (['post', 'put', 'patch'].includes(method)) {
                        if (op.requestBody) {
                            const content = op.requestBody.content?.['application/json'] || op.requestBody.content?.['application/vnd.api+json'];
                            if (content && content.schema && content.schema.properties) {
                                const bodyData: any = {};
                                let hasBody = false;
                                for (const propName of Object.keys(content.schema.properties)) {
                                    if (args[propName] !== undefined) {
                                        bodyData[propName] = args[propName];
                                        hasBody = true;
                                    }
                                }
                                if (hasBody) {
                                    Object.assign(params.body, bodyData);
                                }
                            }
                        }
                    }

                    return await withMiddleware(server, safeToolName, args, async () => {
                        // Execute
                        // @ts-ignore
                        const { data, error, response } = await client[method.toUpperCase()](pathUrl, {
                            params: {
                                path: Object.keys(params.path).length ? params.path : undefined,
                                query: Object.keys(params.query).length ? params.query : undefined,
                            },
                            body: Object.keys(params.body).length ? params.body : undefined,
                        });

                        if (error || !response.ok) {
                            const status = response.status;
                            const errorMsg = error ? JSON.stringify(error) : "Unknown API Error";

                            let errorCode = ErrorCode.InternalError;
                            if (status === 400) errorCode = ErrorCode.InvalidParams;
                            else if (status === 401 || status === 403) errorCode = ErrorCode.InvalidRequest;
                            else if (status === 404) errorCode = ErrorCode.InvalidRequest;

                            throw new McpError(errorCode, `API Error (${status}): ${errorMsg}`);
                        }

                        return {
                            content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
                        };
                    });
                }
            );
        }

    }

    return server;
}
