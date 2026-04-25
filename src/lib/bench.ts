import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LmxError, EXIT_RUNTIME, EXIT_USAGE } from "./errors.js";
import type { RuntimeConfig } from "./global-config.js";
import { expandAtFileReference } from "./invocation.js";
import { listProgramNames, loadProgram, resolveProgramDir, type LoadedProgram } from "./program.js";
import { executeProgram } from "./run-program.js";
import { benchCapabilitySchema, type BenchJob, type Rubric } from "./schemas.js";
import { pathExists } from "./paths.js";
import { parseYamlFile, stringifyYaml } from "./yaml.js";

export interface BenchCommandOptions {
  modelOverride?: string;
}

interface LoadedBenchCapability {
  name: string;
  dir: string;
  jobs: BenchJob[];
}

interface RubricOutcome {
  verdict: "MET" | "UNMET" | "ERROR";
  error?: string;
}

interface BashExecution {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function collectYamlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "results") {
      continue;
    }

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

async function loadBenchCapabilities(program: LoadedProgram): Promise<LoadedBenchCapability[]> {
  const benchDir = path.join(program.dir, "bench");
  if (!(await pathExists(benchDir))) {
    throw new LmxError(`Missing bench directory in ${program.dir}`, EXIT_USAGE);
  }

  const files = await collectYamlFiles(benchDir);
  if (files.length === 0) {
    throw new LmxError(`No bench capability YAML files found in ${benchDir}`, EXIT_USAGE);
  }

  return Promise.all(
    files.map(async (filePath) => {
      const parsed = parseYamlFile<unknown>(await readFile(filePath, "utf8"), filePath);
      const relativeName = path.relative(benchDir, filePath).replace(/\\/g, "/").replace(/\.ya?ml$/i, "");
      return {
        name: relativeName,
        dir: path.dirname(filePath),
        jobs: benchCapabilitySchema.parse(parsed),
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
  const providedParams: Record<string, string> = {
    context,
    rubric: rubric.rubric,
  };

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
    input: candidate,
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

function bashQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function resolveCliEntrypointPath(): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(moduleDir, "../cli.js"), path.resolve(moduleDir, "../../dist/cli.js")];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new LmxError("Unable to locate lmx CLI entrypoint for bench shims. Run `npm run build` first.", EXIT_USAGE);
}

async function writeProgramShim(binDir: string, cliPath: string, commandName: string, programRef: string, modelOverride: string): Promise<void> {
  const scriptPath = path.join(binDir, commandName);
  const script = `#!/usr/bin/env bash
exec node ${bashQuote(cliPath)} run ${bashQuote(programRef)} --model ${bashQuote(modelOverride)} "$@"
`;
  await writeFile(scriptPath, script, "utf8");
  await chmod(scriptPath, 0o755);
}

async function createBenchBinDir(runtime: RuntimeConfig, program: LoadedProgram, modelOverride: string): Promise<string> {
  const cliPath = (await resolveCliEntrypointPath()).replace(/\\/g, "/");
  const binDir = await mkdtemp(path.join(os.tmpdir(), "lmx-bench-bin-"));
  const programNames = await listProgramNames(runtime);

  await Promise.all(programNames.map((programName) => writeProgramShim(binDir, cliPath, programName, programName, modelOverride)));
  await writeProgramShim(binDir, cliPath, program.config.name, program.dir.replace(/\\/g, "/"), modelOverride);

  return binDir;
}

function withPrependedPath(binDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const currentPath = env[pathKey] ?? "";
  const nextPath = `${binDir}${path.delimiter}${currentPath}`;
  env[pathKey] = nextPath;
  env.PATH = nextPath;
  return env;
}

async function runBash(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<BashExecution> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", command], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(new LmxError(`Unable to start bash: ${error.message}`, EXIT_RUNTIME));
    });

    child.on("close", (code, signal) => {
      const signalMessage = signal ? `bash terminated by signal ${signal}` : "";
      resolve({
        stdout,
        stderr: signalMessage ? [stderr, signalMessage].filter(Boolean).join("\n") : stderr,
        exitCode: code ?? EXIT_RUNTIME,
      });
    });
  });
}

async function resolveRubricContext(rubric: Rubric, capabilityDir: string): Promise<string> {
  return expandAtFileReference(rubric.context, capabilityDir);
}

export async function runBench(programRef: string, runtime: RuntimeConfig, options: BenchCommandOptions): Promise<string> {
  const programDir = await resolveProgramDir(programRef, runtime);
  const program = await loadProgram(programDir);
  const benchCapabilities = await loadBenchCapabilities(program);
  const judgeProgram = await loadProgram(await resolveProgramDir("judge", runtime));
  const resultsDir = path.join(program.dir, "bench", "results");
  await mkdir(resultsDir, { recursive: true });

  const runs = runtime.raw.bench_runs ?? 3;
  const modelRef = options.modelOverride ?? program.config.default_model ?? runtime.raw.default_model;
  if (!modelRef) {
    throw new LmxError("Bench requires a candidate model via program default_model, config default_model, or --model.", EXIT_USAGE);
  }

  const shimBinDir = await createBenchBinDir(runtime, program, modelRef);
  const env = withPrependedPath(shimBinDir);

  const capabilityResults: Record<string, unknown> = {};
  let totalRunCount = 0;
  let totalPassedRuns = 0;
  let totalScore = 0;

  try {
    for (const capability of benchCapabilities) {
      const jobResults: Record<string, unknown> = {};
      let capabilityRunCount = 0;
      let capabilityPassedRuns = 0;
      let capabilityScore = 0;

      for (const [jobIndex, job] of capability.jobs.entries()) {
        const resolvedRubrics = await Promise.all(
          job.rubrics.map(async (rubric) => ({
            rubric,
            context: await resolveRubricContext(rubric, capability.dir),
          })),
        );
        const scores: number[] = [];
        const latencies: number[] = [];
        const rubricResults = job.rubrics.map((rubric) => ({
          rubric: rubric.rubric,
          verdicts: [] as string[],
          pass_rate: 0,
          errors: [] as string[],
        }));

        for (let index = 0; index < runs; index += 1) {
          const startedAt = Date.now();
          const execution = await runBash(job.bash, capability.dir, env);
          latencies.push(Date.now() - startedAt);

          if (execution.exitCode !== 0) {
            for (const result of rubricResults) {
              result.verdicts.push("ERROR");
              result.errors.push(execution.stderr || `bash exited ${execution.exitCode}`);
            }
            scores.push(0);
            totalRunCount += 1;
            capabilityRunCount += 1;
            continue;
          }

          let passedRubrics = 0;
          for (const [rubricIndex, resolvedRubric] of resolvedRubrics.entries()) {
            const outcome = await evaluateRubric(judgeProgram, runtime, resolvedRubric.context, execution.stdout, resolvedRubric.rubric);
            const result = rubricResults[rubricIndex]!;
            result.verdicts.push(outcome.verdict);
            if (outcome.error) {
              result.errors.push(outcome.error);
            }
            if (outcome.verdict === "MET") {
              passedRubrics += 1;
            }
          }

          const score = passedRubrics / job.rubrics.length;
          scores.push(score);
          totalRunCount += 1;
          capabilityRunCount += 1;
          totalScore += score;
          capabilityScore += score;
          if (score === 1) {
            totalPassedRuns += 1;
            capabilityPassedRuns += 1;
          }
        }

        for (const result of rubricResults) {
          result.pass_rate = result.verdicts.filter((verdict) => verdict === "MET").length / result.verdicts.length;
        }

        jobResults[String(jobIndex)] = {
          bash: job.bash,
          pass_rate: scores.filter((score) => score === 1).length / scores.length,
          avg_latency_ms: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
          scores,
          rubrics: rubricResults,
        };
      }

      capabilityResults[capability.name] = {
        pass_rate: capabilityRunCount === 0 ? 0 : capabilityPassedRuns / capabilityRunCount,
        score: capabilityRunCount === 0 ? 0 : capabilityScore / capabilityRunCount,
        jobs: jobResults,
      };
    }
  } finally {
    await rm(shimBinDir, { recursive: true, force: true });
  }

  const sanitizedModel = modelRef.replaceAll("/", "_").replaceAll(":", "_");
  const outputPath = path.join(resultsDir, `${sanitizedModel}.yaml`);
  const resultDocument = {
    model: modelRef,
    timestamp: new Date().toISOString(),
    runs,
    capabilities: capabilityResults,
    overall: {
      pass_rate: totalRunCount === 0 ? 0 : totalPassedRuns / totalRunCount,
      score: totalRunCount === 0 ? 0 : totalScore / totalRunCount,
    },
  };

  await writeFile(outputPath, stringifyYaml(resultDocument), "utf8");
  return outputPath;
}
