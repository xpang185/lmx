import { buildProgram, createRuntime, resolveProgramDir } from "../lib/program.js";

export async function runBuildCommand(args: string[]): Promise<void> {
  const [programRef] = args;
  if (!programRef || args.length !== 1) {
    throw new Error("Usage: lmx build <name|path>");
  }

  const runtime = await createRuntime();
  const programDir = await resolveProgramDir(programRef, runtime);
  await buildProgram(programDir);
  process.stdout.write(`${programDir}\n`);
}
