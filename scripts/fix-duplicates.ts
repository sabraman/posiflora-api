import fs from 'fs';
import path from 'path';

const CLIENT_PATH = path.resolve(process.cwd(), 'src/client.ts');

if (!fs.existsSync(CLIENT_PATH)) {
    console.error(`File not found: ${CLIENT_PATH}`);
    process.exit(1);
}

const content = fs.readFileSync(CLIENT_PATH, 'utf-8');
const lines = content.split('\n');

const KNOWN_DUPLICATES = new Set([
    'PaymentsStoreStats',
    'SourcesStoreStats',
    'DebtsStoreStats',
    'RevenueStoreStats',
    'PaymentsRevenueStoreStats',
    'ProfitStoreStats'
]);

const seenKeys = new Set<string>();
const newLines: string[] = [];
let skipStack = 0;
let skippingKey: string | null = null;

// Heuristic: We assume the duplicate keys are properties of an interface, likely indented with 4 spaces
// e.g. "    PaymentsStoreStats: {"
const KEY_REGEX = /^(\s{4})([a-zA-Z0-9_]+): \{$/;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (typeof line === 'undefined') continue;

    // Check if we are currently skipping a block
    if (skippingKey) {
        // Count braces to find end of block
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        skipStack += (openBraces - closeBraces);

        if (skipStack <= 0) {
            console.log(`Removed duplicate block for: ${skippingKey}`);
            skippingKey = null;
            skipStack = 0;
        }
        continue; // Skip this line
    }

    // Check for start of a known duplicate key
    const match = line.match(KEY_REGEX);
    if (match && match[2]) {
        const key = match[2];
        if (KNOWN_DUPLICATES.has(key)) {
            if (seenKeys.has(key)) {
                // Determine indentation
                // We've seen this key before! Start skipping.
                skippingKey = key;
                skipStack = 1; // We just saw the opening brace line
                continue;
            } else {
                seenKeys.add(key);
            }
        }
    }

    newLines.push(line);
}

// Prepend @ts-nocheck to suppress generic errors in generated code
const finalContent = [
    '// @ts-nocheck',
    ...newLines
].join('\n');

fs.writeFileSync(CLIENT_PATH, finalContent);
console.log('Finished patching duplicates and adding @ts-nocheck.');
