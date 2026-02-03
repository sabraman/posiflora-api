import { beforeAll, describe, expect, it, mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import fs from "fs";
import path from "path";
import { createPosifloraServer } from "../../src/create-server.js";

describe("Posiflora MCP Tools Integration", () => {
	let openApiSpec: any;

	beforeAll(() => {
		const specPath = path.resolve(process.cwd(), "openapi.json");
		const openApiContent = fs.readFileSync(specPath, "utf-8");
		openApiSpec = JSON.parse(openApiContent);
	});

	it("should execute a tool successfully using mocked fetch", async () => {
		// Setup mock fetch
		const mockResponse = {
			data: [{ id: "123", name: "Test Flower" }],
		};

		const mockFetch = mock(
			(url: string | URL | Request, init?: RequestInit) => {
				// naive mock that always returns success
				return Promise.resolve(
					new Response(JSON.stringify(mockResponse), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				);
			},
		);

		// Initialize server with mock
		const server = createPosifloraServer("test-key", openApiSpec, {
			// @ts-expect-error - bun mock fetch types might specific but compatible enough
			fetch: mockFetch,
		});

		// Initialize Client
		const client = new Client(
			{
				name: "test-client",
				version: "1.0.0",
			},
			{
				capabilities: {},
			},
		);

		// Connect via InMemoryTransport
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		// List tools to find one to call
		const toolsResult = await client.listTools();
		const tools = toolsResult.tools;
		expect(tools.length).toBeGreaterThan(0);

		// Pick the first tool (assuming at least one exists and is a GET or simple POST)
		// Ideally we pick a specific one we know exists.
		// Let's print one to see what we have if we fail, but let's try to find one that looks like a GET.
		const tool = tools[0];
		if (!tool) throw new Error("No tool found");
		console.log(`Testing tool: ${tool.name}`);

		// Call the tool
		const result = await client.callTool({
			name: tool.name,
			arguments: {}, // Assuming optional args or no args for at least one tool
		});

		// Verify result
		expect(result).toBeDefined();
		const content: any = result.content;
		expect(content).toBeDefined();
		expect(content[0].type).toBe("text");

		// Check if mock fetch was called
		expect(mockFetch).toHaveBeenCalled();

		// Verify output contains our mock data
		const text = content[0]?.text;
		expect(text).toContain("Test Flower");
	});
});
