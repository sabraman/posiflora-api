import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { openApiTypeToZod } from "../../src/utils.js";

describe("openApiTypeToZod", () => {
    it("should handle strings", () => {
        const schema = { type: "string", description: "A string" };
        const zodSchema = openApiTypeToZod(schema);
        expect(zodSchema).toBeInstanceOf(z.ZodString);
        expect(zodSchema.description).toBe("A string");
    });

    it("should handle enums", () => {
        const schema = { type: "string", enum: ["a", "b"] };
        const zodSchema = openApiTypeToZod(schema);
        expect(zodSchema).toBeInstanceOf(z.ZodEnum);
        const result = zodSchema.safeParse("a");
        expect(result.success).toBe(true);
        const fail = zodSchema.safeParse("c");
        expect(fail.success).toBe(false);
    });

    it("should handle dates", () => {
        const schema = { type: "string", format: "date-time" };
        const zodSchema = openApiTypeToZod(schema);
        // Date handling can be complex, verify it accepts ISO string
        expect(zodSchema.safeParse("2023-01-01T00:00:00Z").success).toBe(true);
    });

    it("should handle integers and numbers", () => {
        expect(openApiTypeToZod({ type: "integer" })).toBeInstanceOf(z.ZodNumber);
        expect(openApiTypeToZod({ type: "number" })).toBeInstanceOf(z.ZodNumber);
    });

    it("should handle booleans", () => {
        expect(openApiTypeToZod({ type: "boolean" })).toBeInstanceOf(z.ZodBoolean);
    });

    it("should handle arrays", () => {
        const schema = { type: "array", items: { type: "string" } };
        const zodSchema = openApiTypeToZod(schema);
        expect(zodSchema).toBeInstanceOf(z.ZodArray);
        expect(zodSchema.safeParse(["a", "b"]).success).toBe(true);
    });

    it("should handle objects", () => {
        const schema = {
            type: "object",
            properties: {
                foo: { type: "string" },
                bar: { type: "integer" }
            }
        };
        const zodSchema = openApiTypeToZod(schema);
        expect(zodSchema).toBeInstanceOf(z.ZodObject);
        expect(zodSchema.safeParse({ foo: "s", bar: 1 }).success).toBe(true);
    });

    it("should fallback to any for unknown types", () => {
        expect(openApiTypeToZod({ type: "unknown" })).toBeInstanceOf(z.ZodAny);
        expect(openApiTypeToZod(undefined)).toBeInstanceOf(z.ZodAny);
    });
});
