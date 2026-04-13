import { createRuntime, listProgramNames } from "../lib/program.js";

export async function runListCommand(args: string[]): Promise<void> {
  if (args.length !== 0) {
    throw new Error("Usage: lmx list");
  }

  const runtime = await createRuntime();
  const names = await listProgramNames(runtime);
  process.stdout.write(`${names.join("\n")}${names.length ? "\n" : ""}`);
}
