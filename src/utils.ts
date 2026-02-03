import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Helper to convert OpenAPI type to Zod
export function openApiTypeToZod(schema: any, spec?: any): z.ZodType<any> {
	if (!schema) return z.any().describe("Unknown type");

	// Handle references (shallow resolution)
	if (schema.$ref && spec) {
		const refPath = schema.$ref.replace(/^#\//, "").split("/");
		let current = spec;
		for (const segment of refPath) {
			const key = decodeURIComponent(
				segment.replace(/~1/g, "/").replace(/~0/g, "~"),
			);
			current = current?.[key];
		}
		if (current) {
			return openApiTypeToZod(
				{ ...current, description: current.description || schema.description },
				spec,
			);
		}
		return z.any().describe(`Unresolved Ref: ${schema.$ref}`);
	}

	let zodSchema: z.ZodType<any>;

	// Handle anyOf, allOf, oneOf
	if (schema.oneOf || schema.anyOf) {
		const variants = (schema.oneOf || schema.anyOf).map((s: any) =>
			openApiTypeToZod(s, spec),
		);
		zodSchema =
			variants.length > 1
				? z.union(variants as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
				: variants[0];
	} else if (schema.allOf) {
		const variants = schema.allOf.map((s: any) => openApiTypeToZod(s, spec));
		// If all are objects, merge them
		if (variants.every((v: any) => v instanceof z.ZodObject)) {
			zodSchema = variants.reduce((acc: any, curr: any) => acc.merge(curr));
		} else {
			zodSchema = variants[0]; // Fallback to first
		}
	} else {
		switch (schema.type) {
			case "string":
				if (schema.enum && schema.enum.length > 0) {
					zodSchema = z.enum(schema.enum as [string, ...string[]]);
				} else if (schema.format === "date-time" || schema.format === "date") {
					zodSchema = z.string().datetime({ offset: true }).or(z.string());
				} else {
					zodSchema = z.string();
					if (schema.minLength !== undefined)
						zodSchema = (zodSchema as z.ZodString).min(schema.minLength);
					if (schema.maxLength !== undefined)
						zodSchema = (zodSchema as z.ZodString).max(schema.maxLength);
					if (schema.pattern)
						zodSchema = (zodSchema as z.ZodString).regex(
							new RegExp(schema.pattern),
						);
				}
				break;
			case "integer":
			case "number":
				zodSchema = z.number();
				if (schema.minimum !== undefined) {
					if (schema.exclusiveMinimum === true) {
						zodSchema = (zodSchema as z.ZodNumber).gt(schema.minimum);
					} else {
						zodSchema = (zodSchema as z.ZodNumber).min(schema.minimum);
					}
				} else if (typeof schema.exclusiveMinimum === "number") {
					zodSchema = (zodSchema as z.ZodNumber).gt(schema.exclusiveMinimum);
				}

				if (schema.maximum !== undefined) {
					if (schema.exclusiveMaximum === true) {
						zodSchema = (zodSchema as z.ZodNumber).lt(schema.maximum);
					} else {
						zodSchema = (zodSchema as z.ZodNumber).max(schema.maximum);
					}
				} else if (typeof schema.exclusiveMaximum === "number") {
					zodSchema = (zodSchema as z.ZodNumber).lt(schema.exclusiveMaximum);
				}

				if (schema.multipleOf !== undefined)
					zodSchema = (zodSchema as z.ZodNumber).multipleOf(schema.multipleOf);
				break;
			case "boolean":
				zodSchema = z.boolean();
				break;
			case "array":
				zodSchema = z.array(openApiTypeToZod(schema.items || {}, spec));
				break;
			case "object":
				if (schema.properties) {
					const shape: any = {};
					const required = schema.required || [];
					for (const [key, prop] of Object.entries(schema.properties)) {
						let fieldSchema = openApiTypeToZod(prop, spec);
						if (!required.includes(key)) {
							fieldSchema = fieldSchema.optional();
						}
						shape[key] = fieldSchema;
					}
					zodSchema = z.object(shape);
				} else if (schema.additionalProperties) {
					zodSchema = z.record(
						z.string(),
						openApiTypeToZod(
							schema.additionalProperties === true
								? {}
								: schema.additionalProperties,
							spec,
						),
					);
				} else {
					zodSchema = z.record(z.string(), z.any()).describe("Dynamic object");
				}
				break;
			default:
				zodSchema = z
					.any()
					.describe(
						schema.type ? `Unhandled type: ${schema.type}` : "Any type",
					);
		}
	}

	// Build rich description
	const descriptions = [];
	if (schema.title) descriptions.push(`[${schema.title}]`);
	if (schema.description) descriptions.push(schema.description);
	if (schema.default !== undefined)
		descriptions.push(`Default: ${JSON.stringify(schema.default)}`);
	if (schema.example !== undefined)
		descriptions.push(`Example: ${JSON.stringify(schema.example)}`);

	if (descriptions.length > 0) {
		zodSchema = zodSchema.describe(descriptions.join(" | "));
	}

	return zodSchema;
}

/**
 * Maps HTTP status codes to MCP Error codes.
 * MCP Error codes:
 * - ParseError = -32700
 * - InvalidRequest = -32600
 * - MethodNotFound = -32601
 * - InvalidParams = -32602
 * - InternalError = -32603
 */
export function mapHttpStatusCodeToMcpError(status: number): ErrorCode {
	if (status === 400) return ErrorCode.InvalidParams;
	if (status === 401 || status === 403) return ErrorCode.InvalidRequest;
	if (status === 404) return ErrorCode.InvalidParams; // Usually means a path/param was wrong
	if (status === 405) return ErrorCode.MethodNotFound;
	if (status >= 500) return ErrorCode.InternalError;
	return ErrorCode.InternalError;
}
