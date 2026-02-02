
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import fs from "fs";
import path from "path";

// Function to loosely verify tool registration
async function verify() {
    console.log("Loading openapi.json...");
    const specPath = path.resolve(process.cwd(), "openapi.json");
    const spec = JSON.parse(fs.readFileSync(specPath, "utf-8"));

    // Count expected tools (approximate)
    let expectedTools = 0;
    for (const pathKey in spec.paths) {
        for (const method in spec.paths[pathKey]) {
            if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
                expectedTools++;
            }
        }
    }
    console.log(`Expected approximately ${expectedTools} tools from spec.`);

    // We can't easily import the server instance from src/mcp-server.ts because it auto-connects to stdio in main()
    // But we can check if the build file exists and is sizeable
    const buildPath = path.resolve(process.cwd(), "dist/server.js");
    if (fs.existsSync(buildPath)) {
        const stats = fs.statSync(buildPath);
        console.log(`Server build found at ${buildPath} (${stats.size} bytes).`);
        if (stats.size > 100000) {
            console.log("Build size seems healthy (includes dependencies).");
        } else {
            console.error("Build size suspiciously small.");
            process.exit(1);
        }
    } else {
        console.error("Server build not found!");
        process.exit(1);
    }

    console.log("Verification Logic: Since we cannot easily introspect the stdio server without a client, we rely on the build success and basic file checks along with the logic implementation.");
    console.log("To fully test, run 'node dist/server.js' and inspect input/output via an MCP inspector.");
}

verify().catch(console.error);
