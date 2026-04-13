import { createRuntime, listProgramNames } from "../lib/program.js";
import { runBench } from "../lib/bench.js";

export async function runBenchCommand(args: string[]): Promise<void> {
  let modelOverride: string | undefined;
  let all = false;
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--all") {
      all = true;
      continue;
    }

    if (arg === "--model") {
      modelOverride = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--model=")) {
      modelOverride = arg.slice("--model=".length);
      continue;
    }

    positionals.push(arg);
  }

  const runtime = await createRuntime();
  const programRefs = all ? await listProgramNames(runtime) : positionals.slice(0, 1);
  if (programRefs.length === 0) {
    throw new Error("Usage: lmx bench <name> [--model provider/id] | lmx bench --all [--model provider/id]");
  }

  for (const programRef of programRefs) {
    const outputPath = await runBench(programRef, runtime, { modelOverride });
    process.stdout.write(`${outputPath}\n`);
  }
}
