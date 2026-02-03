# Use the official Bun image
FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code and scripts
COPY tsconfig.json openapi.json ./
COPY src ./src
COPY scripts ./scripts

# Generate the API client from the spec
RUN bun run generate

# Set environment variables
ENV NODE_ENV=production

# Expose any necessary ports (MCP usually runs over stdio, but for SSE we might need a port later)
# For now, we assume stdio usage or docker run interaction
# Explicitly set the entrypoint to the MCP server
CMD ["bun", "run", "src/mcp-server.ts"]
