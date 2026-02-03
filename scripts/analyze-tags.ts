import fs from "fs";
import path from "path";

const openApi = JSON.parse(
	fs.readFileSync(path.join(process.cwd(), "openapi.json"), "utf8"),
);

const tagCounts: Record<string, number> = {};

for (const pathKey in openApi.paths) {
	const pathItem = openApi.paths[pathKey];
	for (const method in pathItem) {
		if (["parameters", "summary", "description"].includes(method)) continue;

		const op = pathItem[method];
		if (op.tags && Array.isArray(op.tags)) {
			for (const tag of op.tags) {
				tagCounts[tag] = (tagCounts[tag] || 0) + 1;
			}
		} else {
			tagCounts["Untagged"] = (tagCounts["Untagged"] || 0) + 1;
		}
	}
}

const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

console.log(
	"Total Tools:",
	Object.values(tagCounts).reduce((a, b) => a + b, 0),
);
console.log("\nTools per Tag:");
sorted.forEach(([tag, count]) => {
	console.log(`${tag}: ${count}`);
});
