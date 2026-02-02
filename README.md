# Posiflora API - LLM-Ready Client & MCP Server

**Repository**: [github.com/sabraman/posiflora-api](https://github.com/sabraman/posiflora-api)

A robust, type-safe TypeScript client and Model Context Protocol (MCP) server for the Posiflora API. Automatically updated via GitHub Actions.

## Quick Start

```bash
bun install
```

### 1. Using the Typed Client

The client is generated from the OpenAPI spec and provides strict TypeScript types for all ~150 endpoints.

```typescript
import createClient from "openapi-fetch";
import type { paths } from "./src/client"; // Generated types

const client = createClient<paths>({
    baseUrl: "https://api.posiflora.com",
    headers: {
        "Authorization": `Bearer ${process.env.POSIFLORA_API_KEY}`
    }
});

// Example: Fetch Customer Details (Type-Safe)
const { data, error } = await client.GET("/v1/customers", {
    params: {
        query: {
            "filter[idBonus]": "123", // Typed query params
            include: ["bonusGroup"]   // Autocompleted enums
        }
    }
});

if (error) {
    console.error("API Error:", error); // Error is typed based on spec
} else {
    console.log("Customer:", data.data[0].attributes.title);
}
```

### 2. Using the MCP Server (LLM Integration)

The MCP server allows AI agents (Claude, Gemini, etc.) to interact with Posiflora tools.

**Run the Server:**
```bash
export POSIFLORA_API_KEY=your_key_here
bun run dist/server.js
```

**Tool Invocation Example:**
An LLM can call `get_order_list` to fetch pending orders:
```json
{
  "name": "get_orders_list",
  "arguments": {
    "filter[status]": "new",
    "include": ["items"]
  }
}
```

## Features Deep Dive

### Dynamic Tool Registration
Instead of hardcoding tools, this server **dynamically parses** `openapi.json` at runtime.
1.  **Iterates** over all paths in `openapi.json`.
2.  **Generates** meaningful tool names (e.g., `/v1/orders` -> `get_orders_list`).
3.  **Maps** parameters to **Zod schemas** for validation.
4.  Consequently, if the API adds a new endpoint, the MCP server supports it immediately after a spec update.

### Error Handling
The client uses `openapi-fetch` which returns a discriminated union:
```typescript
const { data, error, response } = await client.GET("/v1/orders");

if (error) {
    // 'error' is strictly typed to the 4xx/5xx responses in openapi.json
    if (response.status === 401) handleAuthError();
    if (response.status === 422) handleValidationError(error); // e.g. invalid filters
    return;
}
// 'data' is present and guaranteed to match 200 OK schema
processOrders(data);
```

### Middleware & Interception
The MCP server includes a `withMiddleware` wrapper in `src/mcp-server.ts`. You can modify this function to intercept all tool calls for logging, rate limiting, or modification.

```typescript
// src/mcp-server.ts
async function withMiddleware<T>(name: string, args: any, fn: () => Promise<T>) {
    console.log(`[Log] Tool ${name} called with`, args);
    // ... add custom logic here ...
    return await fn();
}
```

## Automation & Versioning
- **Daily Cron**: A GitHub Action runs every midnight.
- **Fetch & Diff**: It uses Playwright to scrape the latest `openapi.json` from the docs site.
- **Auto-Update**: If the spec changes, it regenerates `src/client.ts` and creates a PR.
- **Runtime safety**: The MCP server loads the spec at runtime, ensuring it never crashes due to a mismatch between hardcoded tools and the live API.

## Project Structure
- `src/client.ts`: **Generated** TypeScript definitions (do not edit manually).
- `src/mcp-server.ts`: The MCP server implementation.
- `scripts/`: Tools for fetching specs and patching types.
