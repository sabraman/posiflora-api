import { z } from "zod";

// Helper to convert OpenAPI type to Zod
export function openApiTypeToZod(schema: any): z.ZodType<any> {
    if (!schema) return z.any().describe("Unknown type");

    // Handle references
    if (schema.$ref) {
        return z.any().describe(`Ref: ${schema.$ref}`); // TODO: Resolve refs if possible
    }

    switch (schema.type) {
        case "string":
            if (schema.enum && schema.enum.length > 0) {
                // @ts-ignore
                return z.enum(schema.enum).describe(schema.description || "");
            }
            if (schema.format === "date-time" || schema.format === "date") {
                return z.string().datetime({ offset: true }).or(z.string()).describe(schema.description || "ISO Date string");
            }
            return z.string().describe(schema.description || "");
        case "integer":
        case "number":
            return z.number().describe(schema.description || "");
        case "boolean":
            return z.boolean().describe(schema.description || "");
        case "array":
            return z.array(openApiTypeToZod(schema.items)).describe(schema.description || "");
        case "object":
            if (schema.properties) {
                const shape: any = {};
                for (const [key, prop] of Object.entries(schema.properties)) {
                    // @ts-ignore
                    shape[key] = openApiTypeToZod(prop);
                    // Handle required fields if necessary, currently everything optional for flexibility unless customized
                }
                return z.object(shape).describe(schema.description || "");
            }
            return z.any().describe(schema.description || "Object with arbitrary properties");
        default:
            return z.any().describe(schema.description || "Any type");
    }
}
