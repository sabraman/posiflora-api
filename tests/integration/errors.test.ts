import { beforeAll, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import { createPosifloraServer } from "../../src/create-server.js";

describe("Posiflora MCP Error Handling", () => {
	let openApiSpec: any;

	beforeAll(() => {
		const specPath = path.resolve(process.cwd(), "openapi.json");
		const openApiContent = fs.readFileSync(specPath, "utf-8");
		openApiSpec = JSON.parse(openApiContent);
	});

	async function setupServerWithMock(mockFetch: any) {
		const server = createPosifloraServer("test-key", openApiSpec, {
			fetch: mockFetch,
		});

		const client = new Client(
			{ name: "test-client", version: "1.0.0" },
			{ capabilities: {} },
		);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		return { server, client };
	}

	it("should return InvalidParams error on 400 Bad Request", async () => {
		const mockFetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ error: "Bad Request" }), { status: 400 }),
			),
		);
		const { client } = await setupServerWithMock(mockFetch);

		const toolsResult = await client.listTools();
		const tool = toolsResult.tools[0];
		if (!tool) throw new Error("No tools available to test");

		const result = await client.callTool({ name: tool.name, arguments: {} });

		expect(result.isError).toBe(true);
		const content = result.content as any[];
		expect(content[0].text).toContain("API Error (400)");
	});

	it("should return InvalidRequest error on 401 Unauthorized", async () => {
		const mockFetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ error: "Unauthorized" }), {
					status: 401,
				}),
			),
		);
		const { client } = await setupServerWithMock(mockFetch);

		const toolsResult = await client.listTools();
		const tool = toolsResult.tools[0];
		if (!tool) throw new Error("No tools available to test");

		const result = await client.callTool({ name: tool.name, arguments: {} });
		expect(result.isError).toBe(true);
		const content = result.content as any[];
		expect(content[0].text).toContain("API Error (401)");
	});

	it("should return InternalError error on 500 Server Error", async () => {
		const mockFetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ error: "Server Error" }), {
					status: 500,
				}),
			),
		);
		const { client } = await setupServerWithMock(mockFetch);

		const toolsResult = await client.listTools();
		const tool = toolsResult.tools[0];
		if (!tool) throw new Error("No tools available to test");

		const result = await client.callTool({ name: tool.name, arguments: {} });
		expect(result.isError).toBe(true);
		const content = result.content as any[];
		expect(content[0].text).toContain("API Error (500)");
	});
});
