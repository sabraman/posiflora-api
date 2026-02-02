# Posiflora API - LLM-Ready Repository

**Repository**: [github.com/sabraman/posiflora-api](https://github.com/sabraman/posiflora-api)

This repository provides a typed TypeScript client and MCP Server for the Posiflora API, with automated regeneration capabilities.

## Features

- **Auto-Regeneration**: Periodically fetches the latest OpenAPI spec from the official docs.
- **Strict Typing**: Generates TypeScript types directly from the OpenAPI spec.
- **MCP Server**: Exposes API endpoints as "Tools" for LLMs (Claude, Gemini, etc.).

## Usage

### Prerequisites

- [Bun](https://bun.sh/)
- Playwright (for fetching spec) `bun add -d playwright`

### Scripts

- `bun run fetch-spec`: Scrapes the latest `openapi.json` from [posiflora.com/api/](https://posiflora.com/api/).
- `bun run generate`: Generates TypeScript client in `src/client.ts`.
- `bun run update`: Runs both fetch and generate.
- `bun build src/mcp-server.ts --outfile=dist/server.js --target=bun`: Builds the MCP server.

### MCP Server

The MCP server is located in `src/mcp-server.ts`. It **dynamically loads** the `openapi.json` spec and registers **~150+ tools** automatically.

Key features:
- **Auto-Registration**: Every API endpoint (e.g., `/v1/customers`) becomes a tool (e.g., `get_customers_list`, `create_customer`).
- **Dynamic Mapping**: OpenAPI query and path parameters are automatically converted to Zod schemas for tool validation.
- **Always Up-to-Date**: Since it reads `openapi.json` at runtime, any spec update (via the cron job) instantly updates the available tools.

To run the server:
```bash
export POSIFLORA_API_KEY=your_api_key_here
bun run dist/server.js
```

> [!IMPORTANT]
> You **must** set the `POSIFLORA_API_KEY` environment variable. Without it, all tool calls will fail with `401 Unauthorized`.

## Automation

A GitHub Action is configured in `.github/workflows/update-api.yml` to:
1.  Run daily at midnight.
2.  Fetch the latest spec.
3.  Regenerate the client.
4.  Create a Pull Request if changes are detected.

## Project Structure

- `openapi.json`: The Source of Truth.
- `src/client.ts`: Auto-generated Typed Client.
- `scripts/`: Maintenance scripts.
