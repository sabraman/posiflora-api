import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import createClient from "openapi-fetch";
import type { paths } from "./client.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load OpenAPI spec
const specPath = path.resolve(__dirname, "../openapi.json");
if (!fs.existsSync(specPath)) {
    console.error(`Error: Spec file not found at ${specPath}`);
    process.exit(1);
}
const openApiSpec = JSON.parse(fs.readFileSync(specPath, "utf-8"));

// Initialize server
const server = new McpServer({
    name: "posiflora-api",
    version: "1.0.0",
});

const API_URL = openApiSpec.servers?.[0]?.url || "https://api.posiflora.com";
const apiKey = process.env.POSIFLORA_API_KEY;

if (!apiKey) {
    console.warn("Warning: POSIFLORA_API_KEY environment variable is not set. API calls will likely fail.");
}

// @ts-ignore
const client = createClient<paths>({
    baseUrl: API_URL,
    headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : undefined
});

// Helper to convert OpenAPI type to Zod
function openApiTypeToZod(schema: any): z.ZodType<any> {
    if (!schema) return z.any();

    // Handle references (simplistic check, ideally resolve properly)
    if (schema.$ref) {
        // In a full implementation we would resolve the ref. 
        // For now, treat as any or string to avoid crashing, 
        // or try to infer from ref name if possible.
        return z.any().describe(`Ref: ${schema.$ref}`);
    }

    switch (schema.type) {
        case "string":
            if (schema.enum) {
                // z.enum requires at least one element
                if (schema.enum.length > 0) {
                    // @ts-ignore
                    return z.enum(schema.enum).describe(schema.description || "");
                }
                return z.string().describe(schema.description || "");
            }
            if (schema.format === "date-time" || schema.format === "date") {
                return z.string().describe(schema.description || "ISO Date string");
            }
            return z.string().describe(schema.description || "");
        case "integer":
        case "number":
            return z.number().describe(schema.description || "");
        case "boolean":
            return z.boolean().describe(schema.description || "");
        case "array":
            return z.array(openApiTypeToZod(schema.items)).describe(schema.description || "");
        case "object":
            // Complex objects are tricky for tool args, usually tools take validaiton primitives.
            // But we can try to support simple objects or just pass as any
            if (schema.properties) {
                const shape: any = {};
                for (const [key, prop] of Object.entries(schema.properties)) {
                    shape[key] = openApiTypeToZod(prop);
                }
                return z.object(shape).describe(schema.description || "");
            }
            return z.any().describe(schema.description || "");
        default:
            return z.any().describe(schema.description || "");
    }
}

// Iterate over paths and register tools
for (const [pathUrl, pathItem] of Object.entries(openApiSpec.paths || {})) {
    // @ts-ignore
    for (const [method, operation] of Object.entries(pathItem)) {
        if (['parameters', 'summary', 'description'].includes(method)) continue;

        const op = operation as any;
        const operationId = op.operationId || `${method}_${pathUrl.replace(/\//g, '_').replace(/[{}]/g, '')}`;
        const toolName = operationId.replace(/-/g, '_').replace(/\s+/g, '_').toLowerCase();
        // sanitize tool name (only letters, numbers, underscores)
        const safeToolName = toolName.replace(/[^a-z0-9_]/g, '_').substring(0, 64);

        const description = op.summary || op.description || `${method.toUpperCase()} ${pathUrl}`;

        // Build Zod schema for args
        const shape: Record<string, z.ZodType<any>> = {};

        // 1. Path parameters
        const pathParams = (pathItem as any).parameters || [];
        const opParams = op.parameters || [];
        const allParams = [...pathParams, ...opParams];

        for (const param of allParams) {
            if (param.in === 'path' || param.in === 'query') {
                // For query params that are arrays like filter[categories], ensure keys are safe
                // Actually MCP tools arguments must be simple identifiers usually.
                // "filter[id]" is a valid JSON key but might be annoying to use as a function arg in some LLMs
                // But for raw tool call it's fine.
                const isRequired = param.required;
                let zodSchema = openApiTypeToZod(param.schema || {});
                if (!isRequired) {
                    zodSchema = zodSchema.optional();
                }
                shape[param.name] = zodSchema;
            }
        }

        // 2. Request Body
        // If there is a body, we might want to flatten it or add it as a "body" argument
        // For simplicity, let's look for simple bodies or skip complex ones for now
        // or just expose the top level properties if it's an object
        if (op.requestBody) {
            const content = op.requestBody.content?.['application/json'] || op.requestBody.content?.['application/vnd.api+json'];
            if (content && content.schema) {
                // If the body has properties, flattening them into the tool usage is often cleaner
                // UNLESS there is a name collision with query params.
                if (content.schema.type === 'object' && content.schema.properties) {
                    for (const [propName, propSchema] of Object.entries(content.schema.properties)) {
                        if (!shape[propName]) {
                            // @ts-ignore
                            shape[propName] = openApiTypeToZod(propSchema).optional(); // Mark body props as optional to be safe, or check strictness
                        }
                    }
                }
            }
        }

        server.tool(
            safeToolName,
            description,
            shape,
            async (args) => {
                // Separate args into path, query, and body
                const params: any = { query: {}, path: {}, body: {} };

                // We need to know which arg goes where. 
                // We can re-iterate the spec or heuristic.
                // Runtime check: if path has {arg}, it goes to path.

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
                // Re-check definitions is best, but heavy.
                // Simple heuristic: if in pathKeys -> path. Else -> Query (GET) or Body (POST/PUT/PATCH)?

                // Better approach: Re-scan the definitions for this specific op
                for (const param of allParams) {
                    if (param.in === 'query' && args[param.name] !== undefined) {
                        params.query[param.name] = args[param.name];
                    }
                }

                // Request Body handling
                // If there are leftovers and method allows body, put in body
                if (['post', 'put', 'patch'].includes(method)) {
                    // Try to construct body from known properties
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
                            // Special case: `data` wrapper for JSON:API often used in Posiflora
                            // If the schema expects a "data" property and we have flat props but no data prop provided, 
                            // we usually leave it to the user to provide the structure. 
                            // But since we flattened it above... 
                            // Actually, for complex JSON:API, automating "flattening" is hard. 
                            // Let's assume the user passes the top level keys.
                            if (hasBody) {
                                // Check if we need to wrap in { data: ... }
                                // Simple logic: pass what matches the top level schema
                                Object.assign(params.body, bodyData);
                            }
                        }
                    }
                }

                // Execute
                try {
                    // @ts-ignore
                    const { data, error } = await client[method.toUpperCase()](pathUrl, {
                        params: {
                            path: Object.keys(params.path).length ? params.path : undefined,
                            query: Object.keys(params.query).length ? params.query : undefined,
                        },
                        body: Object.keys(params.body).length ? params.body : undefined,
                    });

                    if (error) {
                        return {
                            content: [{ type: "text", text: `Error: ${JSON.stringify(error)}` }],
                            isError: true,
                        };
                    }

                    return {
                        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
                    };
                } catch (err: any) {
                    return {
                        content: [{ type: "text", text: `Exception: ${err.message}` }],
                        isError: true,
                    };
                }
            }
        );
    }
}

async function main() {
    console.error(`Starting Posiflora MCP Server... Registered generic tools.`);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
