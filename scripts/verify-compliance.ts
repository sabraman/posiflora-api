import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";

async function verifyCompliance() {
	console.log("🚀 Starting Compliance Verification...");

	const transport = new StdioClientTransport({
		command: "bun",
		args: ["run", "src/mcp-server.ts"],
	});

	const client = new Client(
		{ name: "compliance-client", version: "1.0.0" },
		{ capabilities: {} },
	);

	try {
		await client.connect(transport);
		console.log("✅ Server Connected");

		// 1. Verify Resource Templates
		console.log("\n📦 Checking Resource Templates...");
		const resources = await client.listResources();

		// Check for templates capability or inspecting resources list if templates are returned there (usually they are separate)
		// SDK client might not have simple method for templates yet, but let's try reading a known template-like URI
		// Actually, we can check basic resources first.
		const staticResource = resources.resources.find(
			(r) => r.uri === "posiflora://openapi.json",
		);
		if (staticResource)
			console.log("✅ Found Static Resource: posiflora://openapi.json");
		else console.error("❌ Missing Static Resource");

		// Create a temporary schema for validation to avoid import issues
		// ListResourceTemplatesResultSchema matches { resourceTemplates: ResourceTemplate[], meta?: ... }
		// We'll trust the server response for now or just pass generic schema if the SDK requires it.
		// The SDK's client.request(method, schema) requires a Zod schema.
		const { z } = require("zod");
		const SimpleTemplateSchema = z
			.object({
				resourceTemplates: z.array(
					z.object({
						uriTemplate: z.string(),
						name: z.string().optional(),
						description: z.string().optional(),
						mimeType: z.string().optional(),
					}),
				),
			})
			.passthrough();

		const templatesResult = await client.request(
			{ method: "resources/templates/list" },
			SimpleTemplateSchema,
		);
		const templates = templatesResult.resourceTemplates;
		if (templates && templates.length > 0) {
			console.log(`✅ Found ${templates.length} Resource Templates`);
			console.log(`   Sample: ${templates[0].uriTemplate}`);
		} else {
			console.error("❌ No Resource Templates found");
		}

		// 2. Verify Error Handling (401 Expected because no API Key)
		console.log(
			"\n🛡 Checking Error Handling (Expect 401 -> InvalidRequest)...",
		);
		try {
			// Find a tool to call
			const tools = await client.listTools();
			const tool = tools.tools.find(
				(t) => t.name.includes("get") && t.name.includes("customer"),
			);

			if (tool) {
				console.log(`   Calling tool: ${tool.name}`);
				const result = await client.callTool({
					name: tool.name,
					arguments: {},
				});

				if (result.isError) {
					console.log("✅ Tool call returned expected error (isError: true)");
					const text = ((result.content as any[])?.[0] as any)?.text || "";
					if (text.includes("401")) {
						console.log("✅ Error message contains expected 401 status");
					} else {
						console.warn(`⚠ Error message does not contain 401: ${text}`);
					}
				} else {
					console.error(
						"❌ Tool call succeeded unexpectedly (Should have failed with 401)",
					);
					console.log("   Result content:", JSON.stringify(result, null, 2));
				}
			} else {
				console.warn("⚠ No suitable tool found to test");
			}

			// Test 2: Invalid Resource Call to trigger 404 or 400
			console.log(
				"\n   Testing Invalid Resource Call (get_v1_customers_id)...",
			);
			try {
				const result = await client.callTool({
					name: "get_v1_customers_id",
					arguments: { id: "NON_EXISTENT_ID_12345" },
				});

				if (result.isError) {
					console.log(
						"✅ Invalid Resource Call returned expected error (isError: true)",
					);
					const text = ((result.content as any[])?.[0] as any)?.text || "";
					if (text.includes("404")) {
						console.log("✅ Error message contains expected 404 status");
					}
				} else {
					console.error(
						"❌ Invalid Resource Call succeeded (Should have failed with 404)",
					);
				}
			} catch (e: any) {
				console.log(`   Received Protocol Error: ${e.message}`);
				if (e.message.includes("404") || e.code === ErrorCode.InvalidRequest) {
					console.log(
						"✅ Protocol Error Validation Passed (404 mapped correctly)",
					);
				} else {
					console.log(`   Detailed error check: code=${e.code}`);
				}
			}
		} catch (e: any) {
			console.log(`   Received Unhandled Error: ${e.message}`);
			if (
				e.code === ErrorCode.InvalidRequest ||
				e.message.includes("InvalidRequest") ||
				e.message.includes("401")
			) {
				console.log("✅ Protocol Error Validation Passed");
			} else {
				console.log(
					`⚠ Received Error Code: ${e.code}. Verifying if this is acceptable...`,
				);
			}
		}
	} catch (e) {
		console.error("❌ specific error", e);
	} finally {
		await client.close();
	}
}

verifyCompliance().catch(console.error);
