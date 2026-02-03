import { describe, it, expect, beforeAll, mock } from "bun:test";
import { createPosifloraServer } from "../../src/create-server.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import fs from "fs";
import path from "path";

describe("Posiflora MCP Resources Integration", () => {
    let openApiSpec: any;

    beforeAll(() => {
        const specPath = path.resolve(process.cwd(), "openapi.json");
        const openApiContent = fs.readFileSync(specPath, "utf-8");
        openApiSpec = JSON.parse(openApiContent);
    });

    it("should read a resource successfully using mocked fetch", async () => {
        // Setup mock fetch
        const mockResponse = {
            id: "123",
            title: "Test Resource"
        };

        const mockFetch = mock((url: string | URL | Request, init?: RequestInit) => {
            return Promise.resolve(new Response(JSON.stringify(mockResponse), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            }));
        });

        // Initialize server with mock
        const server = createPosifloraServer("test-key", openApiSpec, {
            // @ts-ignore
            fetch: mockFetch
        });

        // Initialize Client
        const client = new Client({
            name: "test-client",
            version: "1.0.0"
        }, {
            capabilities: {}
        });

        // Connect via InMemoryTransport
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        await client.connect(clientTransport);

        // List resources to find one to read
        // Note: Resources in this server are Templates! So `listResources` might be empty if there are no concrete resources,
        // but `listResourceTemplates` should have entries.
        // Let's check templates.
        const templatesResult = await client.listResourceTemplates();
        const templates = templatesResult.resourceTemplates;

        if (templates && templates.length > 0) {
            const template = templates[0];
            if (!template) throw new Error("No template found");
            console.log(`Testing resource template: ${template.uriTemplate}`);

            // Construct a valid URI from the template
            // Template format is like: posiflora://api/v1/locations/{id}
            // We need to replace variables.
            let uri = template.uriTemplate;
            // distinct Replace {variable} with "123"
            uri = uri.replace(/\{[^}]+\}/g, "123");

            console.log(`Reading resource: ${uri}`);

            // Read the resource
            const result = await client.readResource({ uri });

            // Verify result
            expect(result).toBeDefined();
            expect(result.contents).toBeDefined();
            expect(result.contents.length).toBeGreaterThan(0);
            const contents: any = result.contents;
            expect(contents[0].mimeType).toBe("application/json");

            // Check if mock fetch was called
            expect(mockFetch).toHaveBeenCalled();

            // Verify output contains our mock data
            const content: any = result.contents[0];
            const text = content.text;
            expect(text).toContain("Test Resource");
        } else {
            console.warn("No resource templates found to test.");
        }
    });
});
