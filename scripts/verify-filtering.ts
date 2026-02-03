import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function verifyFiltering() {
    console.log("🚀 Verifying Tool Filtering...");

    // 1. Run with specific tags
    const transport = new StdioClientTransport({
        command: "bun",
        args: ["run", "src/mcp-server.ts"],
        env: {
            ...process.env,
            POSIFLORA_ENABLED_TAGS: "Orders API,Customers API"
        }
    });

    const client = new Client(
        { name: "filter-client", version: "1.0.0" },
        { capabilities: {} }
    );

    await client.connect(transport);
    const toolsResult = await client.listTools();
    const toolCount = toolsResult.tools.length;

    console.log(`info: Found ${toolCount} tools with filter "Orders API,Customers API"`);

    // We expect ~19 tools (11 orders + 8 customers, roughly)
    if (toolCount > 0 && toolCount < 50) {
        console.log(`✅ Filter Logic Passed: Tool count ${toolCount} is within expected range (<50).`);
    } else {
        console.error(`❌ Filter Logic Failed: Tool count ${toolCount} is unexpected.`);
        process.exit(1);
    }

    // Check if tools actually belong to these tags (by name check)
    const hasOrders = toolsResult.tools.some(t => t.name.includes('orders'));
    const hasCustomers = toolsResult.tools.some(t => t.name.includes('customers'));

    if (hasOrders && hasCustomers) {
        console.log("✅ Verified: 'orders' and 'customers' tools are present.");
    } else {
        console.error("❌ Failed: Specific tools not found.");
        process.exit(1);
    }

    await client.close();
}

verifyFiltering().catch(console.error);
