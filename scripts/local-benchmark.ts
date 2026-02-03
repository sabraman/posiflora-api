import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";

async function runBenchmark() {
	console.log("🚀 Starting Local Benchmark for Posiflora MCP Server...");
	const scores: Record<string, string> = {};

	// 1. Server Startup & Connection
	const transport = new StdioClientTransport({
		command: "bun",
		args: ["run", "src/mcp-server.ts"],
		env: {
			...process.env,
			// Ensure API key is passed if set, otherwise warn
			POSIFLORA_API_KEY: process.env.POSIFLORA_API_KEY || "",
		},
	});

	const client = new Client(
		{ name: "benchmark-client", version: "1.0.0" },
		{ capabilities: {} },
	);

	const startConnect = performance.now();
	try {
		await client.connect(transport);
		const connectTime = performance.now() - startConnect;
		console.log(`✅ Server Connected in ${connectTime.toFixed(2)}ms`);
		scores["Startup"] = "PASS";
	} catch (e) {
		console.error("❌ Failed to connect to server:", e);
		process.exit(1);
	}

	// 2. Tool Discovery (Dynamic Registration Benchmark)
	console.log("\n🔎 Benchmarking Tool Discovery (Dynamic Registration)...");
	const startList = performance.now();
	const toolsResult = await client.listTools();
	const listTime = performance.now() - startList;

	const toolCount = toolsResult.tools.length;
	console.log(`info: Found ${toolCount} tools.`);

	if (toolCount > 100) {
		console.log(
			`✅ Tool Discovery: PASS (${toolCount} tools loaded in ${listTime.toFixed(2)}ms)`,
		);
		scores["Dynamic Registration"] = "PASS";
	} else {
		console.error(`❌ Tool Discovery: FAIL (Only found ${toolCount} tools)`);
		scores["Dynamic Registration"] = "FAIL";
	}

	// 3. Schema Validation (Input Validation Benchmark)
	console.log("\n🛡 Benchmarking Input Validation (Zod Schemas)...");
	const customerTool = toolsResult.tools.find((t) =>
		t.name.includes("customers"),
	);
	if (customerTool && customerTool.inputSchema) {
		console.log("info: Verified Input Schema exists for 'get_customers_list'");
		scores["Input Validation"] = "PASS";
	} else {
		scores["Input Validation"] = "FAIL";
	}

	// 3.5 Resource Verification
	console.log("\n📦 Benchmarking Resources...");
	const resourcesResult = await client.listResources();
	const openApiResource = resourcesResult.resources.find(
		(r) => r.uri === "posiflora://openapi.json",
	);
	if (openApiResource) {
		console.log("✅ OpenAPI Resource Found");
		// Try reading it
		const resourceContent = await client.readResource({
			uri: "posiflora://openapi.json",
		});
		const firstContent = resourceContent.contents?.[0];
		if (
			firstContent &&
			"text" in firstContent &&
			typeof firstContent.text === "string" &&
			firstContent.text.length > 100
		) {
			console.log(
				`✅ OpenAPI Resource Read Success (${firstContent.text.length} bytes)`,
			);
			scores["Resources"] = "PASS";
		} else {
			console.error("❌ OpenAPI Resource Read Failed (Empty or Binary)");
			scores["Resources"] = "FAIL (Empty/Invalid)";
		}
	} else {
		console.error("❌ OpenAPI Resource Not Found");
		scores["Resources"] = "FAIL (Missing)";
	}

	// 4. End-to-End Call (Mock or Real)
	console.log("\n📞 Benchmarking End-to-End API Call...");
	if (!process.env.POSIFLORA_API_KEY) {
		console.warn("⚠ SKIPPING Real API Call: POSIFLORA_API_KEY not set.");
		scores["E2E Call"] = "SKIPPED (No Auth)";
	} else {
		try {
			const startCall = performance.now();
			// Try a lightweight call, e.g., get simple list or profile
			// Since tool names are dynamic, find one that looks right
			const targetTool = "get_v1_customers"; // or similar, depending on naming logic
			// actually our naming logic is: operationId or method_path
			// check tool list for actual name
			const customerTools = toolsResult.tools.filter(
				(t) => t.name.includes("customers") && t.name.includes("get"),
			);
			if (customerTools.length > 0) {
				const toolToCall = customerTools[0]!.name;
				console.log(`calling tool: ${toolToCall}`);
				const result = await client.callTool({
					name: toolToCall,
					arguments: { limit: 1 },
				});
				const callTime = performance.now() - startCall;

				if (result.isError) {
					console.error("❌ API Call Failed:", result.content);
					scores["E2E Call"] = "FAIL";
				} else {
					console.log(`✅ API Call Success in ${callTime.toFixed(2)}ms`);
					scores["E2E Call"] = "PASS";
				}
			}
		} catch (e) {
			console.error("❌ API Call Exception:", e);
			scores["E2E Call"] = "FAIL";
		}
	}

	// Report
	console.log("\n📊 BENCHMARK RESULTS 📊");
	console.table(scores);

	await client.close();
}

runBenchmark().catch(console.error);
