import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { LmxError, EXIT_USAGE } from "./errors.js";
import type { RuntimeConfig } from "./global-config.js";
import { loadProgram, resolveProgramDir, type LoadedProgram } from "./program.js";
import { executeProgram } from "./run-program.js";
import { benchCaseSchema, type BenchCase, type Rubric } from "./schemas.js";
import { pathExists } from "./paths.js";
import { parseYamlFile, stringifyYaml } from "./yaml.js";

type ParamValue = string | number | boolean;

export interface BenchCommandOptions {
  modelOverride?: string;
}

interface LoadedBenchCase {
  name: string;
  case: BenchCase;
}

interface ParsedArgs {
  providedParams: Record<string, ParamValue>;
  positionals: string[];
}

interface RubricOutcome {
  verdict: "MET" | "UNMET" | "ERROR";
  error?: string;
}

function isBooleanLike(value: string): boolean {
  return value === "true" || value === "false";
}

function splitArgs(input: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        result.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += "\\";
  }

  if (quote) {
    throw new LmxError("Unclosed quote in bench args", EXIT_USAGE);
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result;
}

function parseArgs(program: LoadedProgram, args: string): ParsedArgs {
  const tokens = splitArgs(args);
  const providedParams: Record<string, ParamValue> = {};
  const positionals: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const arg = tokens[index]!;

    if (arg === "--") {
      positionals.push(...tokens.slice(index + 1));
      break;
    }

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const eqIndex = arg.indexOf("=");
    const name = eqIndex === -1 ? arg.slice(2) : arg.slice(2, eqIndex);
    const inlineValue = eqIndex === -1 ? undefined : arg.slice(eqIndex + 1);
    const paramConfig = program.config.params[name];
    if (!paramConfig) {
      throw new LmxError(`Unknown bench arg for ${program.config.name}: --${name}`, EXIT_USAGE);
    }

    const nextValue = inlineValue ?? tokens[index + 1];
    const consumeNext = inlineValue === undefined;

    if (paramConfig.type === "boolean" && inlineValue === undefined && (!nextValue || nextValue.startsWith("--") || !isBooleanLike(nextValue))) {
      providedParams[name] = true;
      continue;
    }

    if (nextValue === undefined) {
      throw new LmxError(`--${name} requires a value`, EXIT_USAGE);
    }

    providedParams[name] = nextValue;
    if (consumeNext) {
      index += 1;
    }
  }

  return { providedParams, positionals };
}

function combineInput(positionals: string[], stdin: string): string {
  const parts: string[] = [];
  if (positionals.length > 0) {
    parts.push(positionals.join(" "));
  }
  if (stdin.length > 0) {
    parts.push(stdin);
  }
  return parts.join("\n\n");
}

async function collectYamlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectYamlFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

async function loadBenchCases(program: LoadedProgram): Promise<LoadedBenchCase[]> {
  const casesDir = path.join(program.dir, "bench", "cases");
  if (!(await pathExists(casesDir))) {
    throw new LmxError(`Missing bench/cases in ${program.dir}`, EXIT_USAGE);
  }

  const files = await collectYamlFiles(casesDir);
  if (files.length === 0) {
    throw new LmxError(`No bench cases found in ${casesDir}`, EXIT_USAGE);
  }

  return Promise.all(
    files.map(async (filePath) => {
      const parsed = parseYamlFile<unknown>(await readFile(filePath, "utf8"), filePath);
      const relativeName = path.relative(casesDir, filePath).replace(/\\/g, "/").replace(/\.ya?ml$/i, "");
      return {
        name: relativeName,
        case: benchCaseSchema.parse(parsed),
      };
    }),
  );
}

function exampleParam(examples: string[]): string | undefined {
  return examples.length > 0 ? examples.join("\n\n") : undefined;
}

async function evaluateRubric(
  judgeProgram: LoadedProgram,
  runtime: RuntimeConfig,
  context: string,
  candidate: string,
  rubric: Rubric,
): Promise<RubricOutcome> {
  const providedParams: Record<string, ParamValue> = {};
  if (context.length > 0) {
    providedParams.context = context;
  }

  const positiveExample = exampleParam(rubric.positive_examples);
  if (positiveExample) {
    providedParams["positive-example"] = positiveExample;
  }

  const negativeExample = exampleParam(rubric.negative_examples);
  if (negativeExample) {
    providedParams["negative-example"] = negativeExample;
  }

  const execution = await executeProgram(judgeProgram, runtime, {
    modelOverride: runtime.raw.judge_model,
    input: `${rubric.rubric}\n\n${candidate}`,
    providedParams,
  });

  if (execution.exitCode !== 0) {
    return { verdict: "ERROR", error: execution.stderr || `judge exited ${execution.exitCode}` };
  }

  const verdict = execution.stdout.trim();
  if (verdict !== "MET" && verdict !== "UNMET") {
    return { verdict: "ERROR", error: `judge returned ${JSON.stringify(execution.stdout)}` };
  }

  return { verdict };
}

export async function runBench(programRef: string, runtime: RuntimeConfig, options: BenchCommandOptions): Promise<string> {
  const programDir = await resolveProgramDir(programRef, runtime);
  const program = await loadProgram(programDir);
  const benchCases = await loadBenchCases(program);
  const judgeProgram = await loadProgram(await resolveProgramDir("judge", runtime));
  const resultsDir = path.join(program.dir, "bench", "results");
  await mkdir(resultsDir, { recursive: true });

  const runs = runtime.raw.bench_runs ?? 3;
  const modelRef = options.modelOverride ?? program.config.default_model ?? runtime.raw.default_model;
  if (!modelRef) {
    throw new LmxError("Bench requires a candidate model via program default_model, config default_model, or --model.", EXIT_USAGE);
  }

  const caseResults: Record<string, unknown> = {};
  let totalRunCount = 0;
  let totalPassedRuns = 0;
  let totalScore = 0;

  for (const benchCase of benchCases) {
    const parsedArgs = parseArgs(program, benchCase.case.args);
    const input = combineInput(parsedArgs.positionals, benchCase.case.input);
    const scores: number[] = [];
    const latencies: number[] = [];
    const rubricResults = benchCase.case.rubrics.map((rubric) => ({
      rubric: rubric.rubric,
      verdicts: [] as string[],
      errors: [] as string[],
    }));

    for (let index = 0; index < runs; index += 1) {
      const startedAt = Date.now();
      const execution = await executeProgram(program, runtime, {
        modelOverride: modelRef,
        input,
        providedParams: parsedArgs.providedParams,
      });
      latencies.push(Date.now() - startedAt);

      if (execution.exitCode !== 0) {
        for (const result of rubricResults) {
          result.verdicts.push("ERROR");
          result.errors.push(execution.stderr || `program exited ${execution.exitCode}`);
        }
        scores.push(0);
        totalRunCount += 1;
        continue;
      }

      let passedRubrics = 0;
      for (const [rubricIndex, rubric] of benchCase.case.rubrics.entries()) {
        const outcome = await evaluateRubric(judgeProgram, runtime, input, execution.stdout, rubric);
        const result = rubricResults[rubricIndex]!;
        result.verdicts.push(outcome.verdict);
        if (outcome.error) {
          result.errors.push(outcome.error);
        }
        if (outcome.verdict === "MET") {
          passedRubrics += 1;
        }
      }

      const score = passedRubrics / benchCase.case.rubrics.length;
      scores.push(score);
      totalRunCount += 1;
      totalScore += score;
      if (score === 1) {
        totalPassedRuns += 1;
      }
    }

    caseResults[benchCase.name] = {
      pass_rate: scores.filter((score) => score === 1).length / scores.length,
      avg_latency_ms: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
      scores,
      rubrics: rubricResults.map((result) => ({
        rubric: result.rubric,
        verdicts: result.verdicts,
        pass_rate: result.verdicts.filter((verdict) => verdict === "MET").length / result.verdicts.length,
        errors: result.errors,
      })),
    };
  }

  const sanitizedModel = modelRef.replaceAll("/", "_").replaceAll(":", "_");
  const outputPath = path.join(resultsDir, `${sanitizedModel}.yaml`);
  const resultDocument = {
    model: modelRef,
    timestamp: new Date().toISOString(),
    runs,
    cases: caseResults,
    overall: {
      pass_rate: totalRunCount === 0 ? 0 : totalPassedRuns / totalRunCount,
      score: totalRunCount === 0 ? 0 : totalScore / totalRunCount,
    },
  };

  await writeFile(outputPath, stringifyYaml(resultDocument), "utf8");
  return outputPath;
}
