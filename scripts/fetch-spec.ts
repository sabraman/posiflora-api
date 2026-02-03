/// <reference lib="dom" />

import fs from "fs";
import path from "path";
import { chromium } from "playwright";

async function fetchSpec() {
	console.log("Launching browser...");
	const browser = await chromium.launch();
	const page = await browser.newPage();

	console.log("Navigating to API docs...");
	page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
	await page.goto("https://posiflora.com/api/");
	await page.waitForTimeout(5000);

	console.log("Waiting for spec to load...");
	// Wait for the download link to appear
	const downloadLinkSelector = 'a[download="openapi.json"]';

	// Try to find the link. The selector might need adjustment based on the actual site structure
	// Based on previous analysis, we know there is a link with "Download" text.
	// We'll try to find that specific link.

	// The logic from the browser subagent was:
	// document.querySelector('a.sc-bsatvv.gidAUi')
	// We should look for a link that has 'Download' text

	// Instead of looking for href, we will click and wait for download
	console.log("Waiting for download event...");
	const downloadPromise = page.waitForEvent("download");

	await page.evaluate(() => {
		const links = Array.from(document.querySelectorAll("a"));
		const downloadLink = links.find((a) => a.textContent?.includes("Download"));
		if (downloadLink) {
			downloadLink.click();
		} else {
			throw new Error("Download link not found for clicking");
		}
	});

	const download = await downloadPromise;
	console.log(`Download detected: ${download.suggestedFilename()}`);

	// Save to temp then move or read stream
	const tempPath = await download.path();
	if (!tempPath) {
		throw new Error("Download failed (no path)");
	}

	const specContent = fs.readFileSync(tempPath, "utf-8");

	// Validate
	try {
		JSON.parse(specContent);
	} catch (e) {
		throw new Error("Fetched content is not valid JSON");
	}

	const outputPath = path.resolve(process.cwd(), "openapi.json");
	fs.writeFileSync(outputPath, specContent);
	console.log(`Saved spec to ${outputPath}`);

	// Cleanup is handled by browser close usually, but playwright deletes temp files on context close

	await browser.close();
}

fetchSpec().catch((err) => {
	console.error("Failed to fetch spec:", err);
	process.exit(1);
});
