# Posiflora API - LLM-Ready Client & MCP Server

**Repository**: [github.com/sabraman/posiflora-api](https://github.com/sabraman/posiflora-api)

A robust, type-safe TypeScript client and Model Context Protocol (MCP) server for the Posiflora API. Automatically updated via GitHub Actions.

## Quick Start

```bash
bun install
bun run src/mcp-server.ts
```

### 1. Using the MCP Server (LLM Integration)

The MCP server allows AI agents to interact with ~150 Posiflora tools dynamically.

**Run the Server:**
```bash
export POSIFLORA_API_KEY=your_key_here
# OR
export POSIFLORA_TOKEN=your_token_here
bun run src/mcp-server.ts
```

**Flatter Tool Arguments:**
The server automatically flattens request bodies into top-level arguments for better LLM experience.
```json
{
  "name": "get_customers_list",
  "arguments": {
    "search": "Bob",
    "filter[idBonus]": "1",
    "include": ["bonusGroup"]
  }
}
```

## Features

### 🚀 High Performance
- **Dynamic Discovery**: Parses ~150 endpoints and registers them as MCP tools in **~20ms**.
- **Fast Startup**: Full server initialization in under **150ms**.

### 🛡 Robust Schema Generation
- **Automatic Zod Mapping**: Converts OpenAPI types to strict Zod schemas with support for:
    - `pattern` (regex) validation.
    - `multipleOf`, `min/max`, `exclusiveMin/Max`.
    - Complex `$ref` resolution (supports JSON pointers like `~1`).
    - `allOf` merging for object types.

### 🔍 Resource Templates
Exposes dynamic resources via URI templates (e.g., `posiflora://api/v1/customers/{id}`). LLMs can "read" specific records directly without calling a tool when appropriate.

### 🛡 Tag Filtering
Reduce the number of exposed tools by setting `POSIFLORA_ENABLED_TAGS`:
```bash
export POSIFLORA_ENABLED_TAGS="Customers API,Orders API"
```

## Project Structure

- `openapi.json`: The source of truth (automatically updated).
- `src/client.ts`: **Generated** TypeScript definitions.
- `src/create-server.ts`: Core MCP server logic and dynamic registration.
- `src/mcp-server.ts`: Entry point for stdio transport.
- `src/utils.ts`: Internal helpers for Zod conversion and error mapping.
- `scripts/verify-compliance.ts`: MCP protocol compliance checker.
- `scripts/local-benchmark.ts`: Performance measurement tool.

## Automation & Versioning
- **Daily Cron**: Fetches the latest spec and regenerates the client.
- **MCP Resilience**: The server loads the local `openapi.json` at runtime, ensuring it's always in sync with the latest types.
