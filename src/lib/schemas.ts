import { z } from "zod";

const paramDefaultSchema = z.union([z.string(), z.number(), z.boolean()]);

const paramConfigBaseSchema = z.object({
  description: z.string().min(1),
  type: z.enum(["string", "number", "boolean"]),
  default: paramDefaultSchema.optional(),
  enum: z.array(z.union([z.string(), z.number()])).optional(),
  required: z.boolean().optional(),
});

function validateParamConfig(value: z.infer<typeof paramConfigBaseSchema>, ctx: z.RefinementCtx): void {
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
}

const paramConfigSchema = paramConfigBaseSchema.superRefine(validateParamConfig);

const positionalParamConfigSchema = paramConfigBaseSchema
  .extend({
    name: z.string().min(1),
  })
  .superRefine(validateParamConfig);

const inputConfigSchema = z
  .object({
    label: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
  })
  .optional()
  .default({});

export const programConfigSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    version: z.string().min(1),
    default_model: z.string().optional(),
    min_bench_score: z.number().min(0).max(1).optional(),
    input: inputConfigSchema,
    positionals: z.array(positionalParamConfigSchema).optional().default([]),
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

    const positionalNames = new Set<string>();
    for (const [index, positional] of value.positionals.entries()) {
      if (positionalNames.has(positional.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate positional argument: ${positional.name}`,
          path: ["positionals", index, "name"],
        });
      }
      positionalNames.add(positional.name);

      if (Object.prototype.hasOwnProperty.call(value.params, positional.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `positional argument conflicts with option: ${positional.name}`,
          path: ["positionals", index, "name"],
        });
      }
    }
  });

export const rubricSchema = z.object({
  rubric: z.string().min(1),
  positive_examples: z.array(z.string()).optional().default([]),
  negative_examples: z.array(z.string()).optional().default([]),
});

export const benchCaseSchema = z.object({
  input: z.string().default(""),
  args: z.string().optional().default(""),
  rubrics: z.array(rubricSchema).min(1),
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
export type BenchCase = z.infer<typeof benchCaseSchema>;
export type Rubric = z.infer<typeof rubricSchema>;
export type GlobalConfig = z.infer<typeof globalConfigSchema>;
