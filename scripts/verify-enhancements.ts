import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function verifyEnhancements() {
    console.log("🚀 Starting Enhancements Verification...");

    const transport = new StdioClientTransport({
        command: "bun",
        args: ["run", "src/mcp-server.ts"],
        env: {
            ...process.env,
            POSIFLORA_RATE_LIMIT_RPS: "2",
        },
    });

    const client = new Client(
        { name: "enhancements-client", version: "1.0.0" },
        { capabilities: {} },
    );

    try {
        await client.connect(transport);
        console.log("✅ Server Connected");

        // 1. Verify Prompts
        console.log("\n💬 Checking Prompts...");
        const prompts = await client.listPrompts();
        const expectedPrompts = [
            "summarize_recent_orders",
            "customer_snapshot",
            "inventory_lookup",
        ];

        for (const name of expectedPrompts) {
            const prompt = prompts.prompts.find((p) => p.name === name);
            if (prompt) {
                console.log(`✅ Found Prompt: ${name}`);
                // Verify getting the prompt
                const result = await client.getPrompt({
                    name,
                    arguments:
                        name === "customer_snapshot"
                            ? { customerId: "test-123" }
                            : name === "inventory_lookup"
                                ? { query: "rose" }
                                : name === "summarize_recent_orders"
                                    ? { customerId: "test-456" }
                                    : {},
                });
                if (result.messages.length > 0) {
                    console.log(`   ✅ Successfully retrieved prompt content for ${name}`);
                } else {
                    console.error(`   ❌ Prompt ${name} returned no messages`);
                }
            } else {
                console.error(`❌ Missing Prompt: ${name}`);
            }
        }

        // 2. Verify Rate Limiting (Rough test)
        console.log("\n⏳ Checking Rate Limiting (Expect requests to be spaced)...");
        const start = Date.now();
        const requests = [];
        // With RPS=2, 5 requests should take at least ~2 seconds
        for (let i = 0; i < 5; i++) {
            requests.push(
                client.callTool({
                    name: "getcustomerslist",
                    arguments: {},
                }),
            );
        }

        await Promise.all(requests);
        const duration = Date.now() - start;
        console.log(`   Requests took ${duration}ms`);

        if (duration >= 1800) { // Slight buffer for timing
            console.log(
                "✅ Rate limiting seems to be working (took >= 1.8s for 5 requests at 2 RPS)",
            );
        } else {
            console.warn(
                `⚠ Rate limiting might be too fast or not working (took ${duration}ms, expected >= 2000ms)`,
            );
        }
    } catch (e) {
        console.error("❌ Error during verification:", e);
    } finally {
        await client.close();
    }
}

verifyEnhancements().catch(console.error);
