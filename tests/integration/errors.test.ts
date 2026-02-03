import { describe, it, expect, beforeAll, mock } from "bun:test";
import { createPosifloraServer } from "../../src/create-server.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";

describe("Posiflora MCP Error Handling", () => {
    let openApiSpec: any;

    beforeAll(() => {
        const specPath = path.resolve(process.cwd(), "openapi.json");
        const openApiContent = fs.readFileSync(specPath, "utf-8");
        openApiSpec = JSON.parse(openApiContent);
    });

    async function setupServerWithMock(mockFetch: any) {
        const server = createPosifloraServer("test-key", openApiSpec, {
            // @ts-ignore
            fetch: mockFetch
        });

        const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        await client.connect(clientTransport);

        return { server, client };
    }

    it("should return InvalidParams error on 400 Bad Request", async () => {
        const mockFetch = mock(() => Promise.resolve(new Response(JSON.stringify({ error: "Bad Request" }), { status: 400 })));
        const { client } = await setupServerWithMock(mockFetch);

        const toolsResult = await client.listTools();
        const tool = toolsResult.tools[0];
        if (!tool) throw new Error("No tools available to test");



        try {
            const result = await client.callTool({ name: tool.name, arguments: {} });
            if (result.isError) {
                // If it returns an error result instead of throwing, we check the content for our error message
                // However, McpError usually results in protocol error.
                // If the server caught it and returned a ToolResult with isError=true, that's different.
                expect(result.isError).toBe(true);
                // Check if content has the error message
                const content: any = result.content;
                const text = content[0]?.text;
                expect(text).toContain("API Error (400)");
                return; // success
            }
            expect().fail("Should have thrown error or returned isError=true");
        } catch (error: any) {
            const err = error as any;
            // Check message for code context
            expect(err.message).toContain("API Error (400)");
        }
    });

    it("should return InvalidRequest error on 401 Unauthorized", async () => {
        const mockFetch = mock(() => Promise.resolve(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })));
        const { client } = await setupServerWithMock(mockFetch);

        const toolsResult = await client.listTools();
        const tool = toolsResult.tools[0];
        if (!tool) throw new Error("No tools available to test");

        const result = await client.callTool({ name: tool.name, arguments: {} });
        if (result.isError) {
            expect(result.isError).toBe(true);
            const content: any = result.content;
            const text = content[0]?.text;
            expect(text).toContain("API Error (401)");
        } else {
            expect().fail("Should have returned isError=true for 401");
        }
    });

    it("should return InternalError error on 500 Server Error", async () => {
        const mockFetch = mock(() => Promise.resolve(new Response(JSON.stringify({ error: "Server Error" }), { status: 500 })));
        const { client } = await setupServerWithMock(mockFetch);

        const toolsResult = await client.listTools();
        const tool = toolsResult.tools[0];
        if (!tool) throw new Error("No tools available to test");

        const result = await client.callTool({ name: tool.name, arguments: {} });
        if (result.isError) {
            expect(result.isError).toBe(true);
            const content: any = result.content;
            const text = content[0]?.text;
            expect(text).toContain("API Error (500)");
        } else {
            expect().fail("Should have returned isError=true for 500");
        }
    });
});
