import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { LmxError, EXIT_RUNTIME, EXIT_USAGE } from "./errors.js";
import type { RuntimeConfig } from "./global-config.js";
import { loadProgram, resolveProgramDir, type LoadedProgram } from "./program.js";
import { executeProgram } from "./run-program.js";
import { benchConfigSchema, type Assertion, type BenchConfig } from "./schemas.js";
import { pathExists } from "./paths.js";
import { parseYamlFile, stringifyYaml } from "./yaml.js";

export interface BenchCommandOptions {
  modelOverride?: string;
}

interface SingleAssertionResult {
  assertion: Assertion;
  pass: boolean;
  reason?: string;
}

interface ProgramRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface JudgeResponse {
  results: Array<{
    assertion: string;
    pass: boolean;
    reason: string;
  }>;
}

function normalizeLineCount(output: string): number {
  if (output.length === 0) {
    return 0;
  }
  return output.split(/\r?\n/).length;
}

function evaluateDeterministicAssertion(assertion: Assertion, result: ProgramRunResult): SingleAssertionResult | undefined {
  if ("contains" in assertion) {
    return { assertion, pass: result.stdout.includes(assertion.contains) };
  }
  if ("not_contains" in assertion) {
    return { assertion, pass: !result.stdout.includes(assertion.not_contains) };
  }
  if ("max_chars" in assertion) {
    return { assertion, pass: result.stdout.length <= assertion.max_chars };
  }
  if ("min_chars" in assertion) {
    return { assertion, pass: result.stdout.length >= assertion.min_chars };
  }
  if ("max_lines" in assertion) {
    return { assertion, pass: normalizeLineCount(result.stdout) <= assertion.max_lines };
  }
  if ("min_lines" in assertion) {
    return { assertion, pass: normalizeLineCount(result.stdout) >= assertion.min_lines };
  }
  if ("matches_regex" in assertion) {
    return { assertion, pass: new RegExp(assertion.matches_regex).test(result.stdout) };
  }
  if ("exit_code" in assertion) {
    return { assertion, pass: result.exitCode === assertion.exit_code };
  }
  if ("stderr_empty" in assertion) {
    return { assertion, pass: assertion.stderr_empty === false ? result.stderr.length > 0 : result.stderr.trim().length === 0 };
  }
  return undefined;
}

function describeAssertion(assertion: Assertion): string {
  return JSON.stringify(assertion);
}

function stripJsonFence(output: string): string {
  const trimmed = output.trim();
  if (trimmed.startsWith("```")) {
    const withoutFirstFence = trimmed.replace(/^```[a-zA-Z0-9_-]*\n/, "");
    return withoutFirstFence.replace(/\n```$/, "").trim();
  }
  return trimmed;
}

async function evaluateJudgeAssertions(
  runtime: RuntimeConfig,
  input: string,
  output: string,
  assertions: Assertion[],
): Promise<SingleAssertionResult[]> {
  const judgeDir = await resolveProgramDir("judge", runtime);
  const judgeProgram = await loadProgram(judgeDir);
  const judgeInput = JSON.stringify(
    {
      input,
      candidate_output: output,
      assertions,
    },
    null,
    2,
  );

  const execution = await executeProgram(judgeProgram, runtime, {
    modelOverride: runtime.raw.judge_model,
    input: judgeInput,
  });

  if (execution.exitCode !== 0) {
    throw new LmxError(`Judge failed: ${execution.stderr || "unknown error"}`, EXIT_RUNTIME);
  }

  const parsed = JSON.parse(stripJsonFence(execution.stdout)) as JudgeResponse;
  const resultsByAssertion = new Map(parsed.results.map((item) => [item.assertion, item]));

  return assertions.map((assertion) => {
    const description = describeAssertion(assertion);
    const result = resultsByAssertion.get(description);
    if (!result) {
      return {
        assertion,
        pass: false,
        reason: "judge did not return a result for this assertion",
      };
    }

    return {
      assertion,
      pass: result.pass,
      reason: result.reason,
    };
  });
}

async function loadBench(program: LoadedProgram): Promise<BenchConfig> {
  const benchPath = path.join(program.dir, "bench", "bench.yaml");
  if (!(await pathExists(benchPath))) {
    throw new LmxError(`Missing bench/bench.yaml in ${program.dir}`, EXIT_USAGE);
  }

  const parsed = parseYamlFile<unknown>(await readFile(benchPath, "utf8"), benchPath);
  return benchConfigSchema.parse(parsed);
}

function splitAssertions(assertions: Assertion[]): { deterministic: Assertion[]; llm: Assertion[] } {
  const deterministic: Assertion[] = [];
  const llm: Assertion[] = [];

  for (const assertion of assertions) {
    if ("sentiment" in assertion || "topic_relevant" in assertion || "factual_to_input" in assertion || "language" in assertion) {
      llm.push(assertion);
    } else {
      deterministic.push(assertion);
    }
  }

  return { deterministic, llm };
}

export async function runBench(programRef: string, runtime: RuntimeConfig, options: BenchCommandOptions): Promise<string> {
  const programDir = await resolveProgramDir(programRef, runtime);
  const program = await loadProgram(programDir);
  const bench = await loadBench(program);
  const resultsDir = path.join(program.dir, "bench", "results");
  await mkdir(resultsDir, { recursive: true });

  const runs = bench.runs ?? runtime.raw.bench_runs ?? 3;
  const modelRef = options.modelOverride ?? program.config.default_model ?? runtime.raw.default_model;
  if (!modelRef) {
    throw new LmxError("Bench requires a candidate model via program default_model, config default_model, or --model.", EXIT_USAGE);
  }

  const testResults: Record<string, { pass_rate: number; avg_latency_ms: number; scores: number[] }> = {};
  let totalRunCount = 0;
  let totalPassedRuns = 0;
  let totalScore = 0;

  for (const test of bench.tests) {
    const input = test.input_file
      ? await readFile(path.resolve(program.dir, test.input_file), "utf8")
      : test.input ?? "";

    const scores: number[] = [];
    const latencies: number[] = [];

    for (let index = 0; index < runs; index += 1) {
      const startedAt = Date.now();
      const execution = await executeProgram(program, runtime, {
        modelOverride: modelRef,
        input,
        providedParams: test.params,
      });
      latencies.push(Date.now() - startedAt);

      const { deterministic, llm } = splitAssertions(test.assert);
      const assertionResults: SingleAssertionResult[] = [];

      for (const assertion of deterministic) {
        const result = evaluateDeterministicAssertion(assertion, execution);
        if (result) {
          assertionResults.push(result);
        }
      }

      if (llm.length > 0) {
        assertionResults.push(...(await evaluateJudgeAssertions(runtime, input, execution.stdout, llm)));
      }

      const passed = assertionResults.filter((item) => item.pass).length;
      const score = assertionResults.length === 0 ? 0 : passed / assertionResults.length;
      scores.push(score);
      totalRunCount += 1;
      totalScore += score;
      if (score === 1) {
        totalPassedRuns += 1;
      }
    }

    testResults[test.name] = {
      pass_rate: scores.filter((score) => score === 1).length / scores.length,
      avg_latency_ms: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
      scores,
    };
  }

  const sanitizedModel = modelRef.replaceAll("/", "_").replaceAll(":", "_");
  const outputPath = path.join(resultsDir, `${sanitizedModel}.yaml`);
  const resultDocument = {
    model: modelRef,
    timestamp: new Date().toISOString(),
    runs,
    tests: testResults,
    overall: {
      pass_rate: totalRunCount === 0 ? 0 : totalPassedRuns / totalRunCount,
      score: totalRunCount === 0 ? 0 : totalScore / totalRunCount,
    },
  };

  await writeFile(outputPath, stringifyYaml(resultDocument), "utf8");
  return outputPath;
}
