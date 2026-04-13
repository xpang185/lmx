import { z } from "zod";

const paramDefaultSchema = z.union([z.string(), z.number(), z.boolean()]);

const paramConfigSchema = z
  .object({
    description: z.string().min(1),
    type: z.enum(["string", "number", "boolean"]),
    default: paramDefaultSchema.optional(),
    enum: z.array(z.union([z.string(), z.number()])).optional(),
    required: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.default !== undefined && typeof value.default !== value.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `default must match declared type ${value.type}`,
        path: ["default"],
      });
    }

    if (value.enum && value.type === "boolean") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "enum is not supported for boolean params",
        path: ["enum"],
      });
    }

    if (value.enum) {
      for (const option of value.enum) {
        if (typeof option !== value.type) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `enum values must match declared type ${value.type}`,
            path: ["enum"],
          });
          break;
        }
      }

      if (value.default !== undefined && !value.enum.some((option) => option === value.default)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "default must be present in enum",
          path: ["default"],
        });
      }
    }
  });

export const programConfigSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    version: z.string().min(1),
    default_model: z.string().optional(),
    min_bench_score: z.number().min(0).max(1).optional(),
    tools: z.array(z.enum(["bash", "read", "none"])).optional().default(["none"]),
    params: z.record(z.string(), paramConfigSchema).optional().default({}),
  })
  .superRefine((value, ctx) => {
    if (value.tools.includes("none") && value.tools.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`none` cannot be combined with other tools",
        path: ["tools"],
      });
    }
  });

const deterministicAssertionSchema = z.union([
  z.object({ contains: z.string() }),
  z.object({ not_contains: z.string() }),
  z.object({ max_chars: z.number().int().nonnegative() }),
  z.object({ min_chars: z.number().int().nonnegative() }),
  z.object({ max_lines: z.number().int().nonnegative() }),
  z.object({ min_lines: z.number().int().nonnegative() }),
  z.object({ matches_regex: z.string() }),
  z.object({ exit_code: z.number().int() }),
  z.object({ stderr_empty: z.boolean().optional().default(true) }),
]);

const llmAssertionSchema = z.union([
  z.object({ sentiment: z.enum(["positive", "negative", "neutral"]) }),
  z.object({ topic_relevant: z.boolean().optional().default(true) }),
  z.object({ factual_to_input: z.boolean().optional().default(true) }),
  z.object({ language: z.string().min(1) }),
]);

export const assertionSchema = z.union([deterministicAssertionSchema, llmAssertionSchema]);

export const benchTestSchema = z
  .object({
    name: z.string().min(1),
    input: z.string().optional(),
    input_file: z.string().optional(),
    stdin: z.boolean().optional().default(false),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
    assert: z.array(assertionSchema).min(1),
  })
  .superRefine((value, ctx) => {
    if (!value.input && !value.input_file) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "each bench test needs either input or input_file",
      });
    }
  });

export const benchConfigSchema = z.object({
  runs: z.number().int().positive().optional(),
  tests: z.array(benchTestSchema).min(1),
});

export const globalConfigSchema = z.object({
  default_model: z.string().optional(),
  judge_model: z.string().optional(),
  programs_dir: z.string().optional(),
  bin_dir: z.string().optional(),
  bench_runs: z.number().int().positive().optional(),
});

export type ProgramConfig = z.infer<typeof programConfigSchema>;
export type ParamConfig = z.infer<typeof paramConfigSchema>;
export type BenchConfig = z.infer<typeof benchConfigSchema>;
export type BenchTest = z.infer<typeof benchTestSchema>;
export type Assertion = z.infer<typeof assertionSchema>;
export type GlobalConfig = z.infer<typeof globalConfigSchema>;
