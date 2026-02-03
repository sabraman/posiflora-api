import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9";

async function testToken() {
    console.log("🚀 Testing with new POSIFLORA_TOKEN (Short JWT Header)...");

    const transport = new StdioClientTransport({
        command: "bun",
        args: ["run", "src/mcp-server.ts"],
        env: {
            ...process.env,
            POSIFLORA_TOKEN: TOKEN,
        },
    });

    const client = new Client(
        { name: "test-token-client", version: "1.0.0" },
        { capabilities: {} },
    );

    try {
        await client.connect(transport);
        console.log("✅ Server Connected");

        // List tools to see what's available
        console.log("\n📦 Listing tools...");
        const tools = await client.listTools();
        const toolNames = tools.tools.map(t => t.name);

        const workersTool = toolNames.find(n => n.includes("worker"));
        const customersTool = toolNames.find(n => n.includes("customer"));

        // Try calling an API tool
        const toolToCall = workersTool || customersTool || "getcustomerslist";
        console.log(`\n💬 Calling ${toolToCall}...`);
        const result = await client.callTool({
            name: toolToCall,
            arguments: {},
        });

        if (result.isError) {
            console.error("❌ API Call Failed:", JSON.stringify(result, null, 2));
        } else {
            console.log("✅ API Call Succeeded!");
            const content = ((result.content as any[])?.[0])?.text || "";
            try {
                const data = JSON.parse(content);
                console.log("Response Data Structure Keys:", Object.keys(data));
                if (data.data) {
                    console.log(`Found ${Array.isArray(data.data) ? data.data.length : 1} entities.`);
                }
            } catch (e) {
                console.log("Raw response (truncated):", content.substring(0, 200) + "...");
            }
        }
    } catch (e) {
        console.error("❌ Fatal Error:", e);
    } finally {
        await client.close();
    }
}

testToken().catch(console.error);
