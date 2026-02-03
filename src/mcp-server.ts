import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPosifloraServer } from "./create-server.js";

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load OpenAPI spec
const specPath = path.resolve(__dirname, "../openapi.json");
if (!fs.existsSync(specPath)) {
	console.error(`Error: Spec file not found at ${specPath}`);
	process.exit(1);
}
const openApiContent = fs.readFileSync(specPath, "utf-8");
const openApiSpec = JSON.parse(openApiContent);
const apiKey = process.env.POSIFLORA_API_KEY || process.env.POSIFLORA_TOKEN;
const hasCredentials = process.env.POSIFLORA_USERNAME && process.env.POSIFLORA_PASSWORD;

if (!apiKey && !hasCredentials) {
	// We can't use sendLoggingMessage yet because server isn't connected, so console.warn is fine here for startup.
	console.warn(
		"Warning: Neither POSIFLORA_API_KEY/TOKEN nor POSIFLORA_USERNAME/PASSWORD environment variables are set. API calls will fail.",
	);
} else if (!apiKey && hasCredentials) {
	console.error(`Status: API Key missing, will attempt auto-login for user: ${process.env.POSIFLORA_USERNAME}`);
}

async function main() {
	console.error(`Starting Posiflora MCP Server...`);

	const server = createPosifloraServer(apiKey, openApiSpec);

	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("Server running on stdio");
}

main().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
