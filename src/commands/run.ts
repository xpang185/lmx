import { readFile } from "node:fs/promises";

import { LmxError, EXIT_USAGE } from "../lib/errors.js";
import { readStdinIfPresent, writeStderr } from "../lib/io.js";
import { assignPositionalParams, combineInput, expandAtFileReference, expandAtFileReferences } from "../lib/invocation.js";
import { buildProgram, createRuntime, loadProgram, resolveProgramDir } from "../lib/program.js";
import { executeProgram } from "../lib/run-program.js";

function isBooleanLike(value: string): boolean {
  return value === "true" || value === "false";
}

export async function runNamedProgramCommand(programRef: string, invocationArgs: string[]): Promise<void> {
  const runtime = await createRuntime();
  const programDir = await resolveProgramDir(programRef, runtime);
  const program = await loadProgram(programDir);

  const runner: { modelOverride?: string; temperature?: number; verbose?: boolean; help?: boolean } = {};
  const providedParams: Record<string, string | number | boolean> = {};
  const positionals: string[] = [];

  for (let index = 0; index < invocationArgs.length; index += 1) {
    const arg = invocationArgs[index]!;

    if (arg === "--") {
      positionals.push(...invocationArgs.slice(index + 1));
      break;
    }

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const [rawName, inlineValue] = arg.slice(2).split("=", 2);
    const name = rawName ?? "";
    const paramConfig = program.config.params[name];

    const nextValue = inlineValue ?? invocationArgs[index + 1];
    const consumeNext = inlineValue === undefined;

    if (name === "help") {
      runner.help = true;
      continue;
    }

    if (name === "verbose") {
      runner.verbose = true;
      continue;
    }

    if (name === "model") {
      if (!nextValue) {
        throw new LmxError("--model requires a value", EXIT_USAGE);
      }
      runner.modelOverride = nextValue;
      if (consumeNext) {
        index += 1;
      }
      continue;
    }

    if (name === "temperature") {
      if (!nextValue) {
        throw new LmxError("--temperature requires a value", EXIT_USAGE);
      }
      runner.temperature = Number(nextValue);
      if (!Number.isFinite(runner.temperature)) {
        throw new LmxError("--temperature expects a number", EXIT_USAGE);
      }
      if (consumeNext) {
        index += 1;
      }
      continue;
    }

    if (!paramConfig) {
      throw new LmxError(`Unknown option: --${name}`, EXIT_USAGE);
    }

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

  if (runner.help) {
    const helpSource = (await readFile(program.helpPath, "utf8").catch(() => null)) ?? (await readFile((await buildProgram(programDir)).helpPath, "utf8"));
    process.stdout.write(helpSource);
    return;
  }

  const stdin = await readStdinIfPresent();
  const expandedPositionals = await Promise.all(positionals.map((value) => expandAtFileReference(value, process.cwd())));
  const expandedParams = await expandAtFileReferences(providedParams, process.cwd());
  const assigned = assignPositionalParams(program, expandedPositionals);
  Object.assign(expandedParams, assigned.providedParams);
  const input = combineInput(assigned.inputPositionals, stdin ?? "");
  if (input.length === 0) {
    throw new LmxError("Missing input. Provide text as an argument or via stdin.", EXIT_USAGE);
  }

  const result = await executeProgram(program, runtime, {
    modelOverride: runner.modelOverride,
    temperature: runner.temperature,
    verbose: runner.verbose,
    input,
    providedParams: expandedParams,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    writeStderr(result.stderr);
  }
  process.exitCode = result.exitCode;
}

export async function runRunCommand(args: string[]): Promise<void> {
  const [programRef, ...invocationArgs] = args;
  if (!programRef) {
    throw new Error("Usage: lmx run <program-dir> [args...]");
  }

  await runNamedProgramCommand(programRef, invocationArgs);
}
