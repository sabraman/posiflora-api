import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Paths
const SPEC_FILE = path.resolve(process.cwd(), 'openapi.json');
const OUTPUT_FILE = path.resolve(process.cwd(), 'src/client.ts');

async function generate() {
    if (!fs.existsSync(SPEC_FILE)) {
        console.error(`Error: Spec file not found at ${SPEC_FILE}`);
        console.error('Run "bun run scripts/fetch-spec.ts" first.');
        process.exit(1);
    }

    console.log('Generating TypeScript types...');
    try {
        execSync(`bunx openapi-typescript ${SPEC_FILE} -o ${OUTPUT_FILE}`, { stdio: 'inherit' });
        console.log(`Types generated to ${OUTPUT_FILE}`);
    } catch (error) {
        console.error('Failed to generate types:', error);
        process.exit(1);
    }
}

generate();
