import createClient from "openapi-fetch";
import type { paths } from "../src/client.js";

/**
 * Helper script to get a fresh POSIFLORA_TOKEN using username and password.
 * Based on the PHP implementation provided.
 */

const BASE_URL = (process.env.POSIFLORA_BASE_URL || "https://demo.posiflora.com/api").replace(/\/$/, "");
const USERNAME = process.env.POSIFLORA_USERNAME || "Djoni";
const PASSWORD = process.env.POSIFLORA_PASSWORD || "3998";

async function getToken() {
    const endpoints = ["/v1/sessions", "/api/v1/sessions"];
    let lastError: any = null;

    for (const endpoint of endpoints) {
        console.log(`\n🔍 Attempting to get session from: ${BASE_URL}${endpoint}`);
        const client = createClient<paths>({
            baseUrl: BASE_URL,
        });

        try {
            // @ts-expect-error
            const { data, error, response } = await client.POST(endpoint as any, {
                body: {
                    data: {
                        type: "sessions",
                        attributes: {
                            username: USERNAME,
                            password: PASSWORD,
                        },
                    },
                },
            } as any);

            if (response.ok && (data as any)?.data?.attributes?.accessToken) {
                const accessToken = (data as any)?.data?.attributes?.accessToken;
                console.log("✅ Login Successful!");
                console.log("----------------------------------------");
                console.log(`POSIFLORA_TOKEN="${accessToken}"`);
                console.log("----------------------------------------");
                console.log("\nYou can now set these environment variables:");
                console.log(`export POSIFLORA_TOKEN="${accessToken}"`);
                console.log(`export POSIFLORA_BASE_URL="${BASE_URL}"`);
                return;
            }

            lastError = error || await response.text();
            console.warn(`⚠️ Attempt failed: ${response.status} - ${typeof lastError === 'string' ? lastError : JSON.stringify(lastError)}`);
        } catch (e) {
            console.error(`❌ Error during attempt: ${e}`);
        }
    }

    console.error("\n❌ All login attempts failed.");
    process.exit(1);
}

getToken().catch(console.error);
