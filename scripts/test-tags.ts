import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function testListTags() {
    const transport = new StdioClientTransport({
        command: "bun",
        args: ["run", "src/mcp-server.ts"]
    });

    const client = new Client(
        { name: "test-client", version: "1.0.0" },
        { capabilities: {} }
    );

    try {
        await client.connect(transport);
        console.log("Calling list_tags...");
        const result1 = await client.callTool({
            name: "list_tags",
            arguments: {}
        });
        console.log("Tags Result:", ((result1.content as any[])?.[0] as any)?.text.substring(0, 100) + "...");

        console.log("\nCalling get_server_status...");
        const result2 = await client.callTool({
            name: "get_server_status",
            arguments: {}
        });
        console.log("Status Result:");
        console.log(((result2.content as any[])?.[0] as any)?.text);
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

testListTags();
