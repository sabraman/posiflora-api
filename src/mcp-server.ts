import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import createClient from "openapi-fetch";
import type { paths } from "./client.js"; // This will be generated
import { z } from "zod";

// Initialize server
const server = new McpServer({
    name: "posiflora-api",
    version: "1.0.0",
});

// We will initialize the client dynamically or statically
// For now, let's assume we have a client type
// Note: We need the client.ts to be generated first to fully implement this.
// But we can sketch the structure.

const API_URL = "https://api.posiflora.com"; // Default URL, might need config
// @ts-ignore
const client = createClient<paths>({ baseUrl: API_URL });

// Helper to register tools
// This is a placeholder. In a real dynamic implementation, we would iterate over the openapi spec
// or explicitly map important endpoints.
// For now, let's register a few key tools as examples/starters.

// Example: Get Customers
server.tool(
    "get_customers",
    "Get a list of customers",
    {
        limit: z.number().describe("Number of items to return").optional(),
        offset: z.number().describe("Offset for pagination").optional()
    },
    async (args) => {
        // @ts-ignore - types not generated yet
        const { data, error } = await client.GET("/v1/customers", {
            params: {
                query: args as any
            }
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
    }
);

async function main() {
    console.error("Starting Posiflora MCP Server...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
