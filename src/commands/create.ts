import { createProgram, createRuntime } from "../lib/program.js";

export async function runCreateCommand(args: string[]): Promise<void> {
  const [name] = args;
  if (!name || args.length !== 1) {
    throw new Error("Usage: lmx create <name>");
  }

  const runtime = await createRuntime();
  const programDir = await createProgram(name, runtime);
  process.stdout.write(`${programDir}\n`);
}
