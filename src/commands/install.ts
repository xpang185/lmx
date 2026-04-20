import { installProgram, isBinDirOnPath } from "../lib/install.js";
import { createRuntime, listProgramNames, resolveProgramDir } from "../lib/program.js";
import { writeStderr } from "../lib/io.js";

export async function runInstallCommand(args: string[]): Promise<void> {
  const runtime = await createRuntime();

  let programRefs: string[];
  if (args.length === 1 && args[0] === "--all") {
    programRefs = await listProgramNames(runtime);
  } else if (args.length === 1) {
    programRefs = [args[0]!];
  } else {
    throw new Error("Usage: lmx install <name|path> | --all");
  }

  for (const programRef of programRefs) {
    const programDir = await resolveProgramDir(programRef, runtime);
    const installedPaths = await installProgram(programDir, runtime);
    for (const installedPath of installedPaths) {
      process.stdout.write(`${installedPath}\n`);
    }
  }

  if (!isBinDirOnPath(runtime.binDir)) {
    writeStderr(`Warning: ${runtime.binDir} is not on PATH`);
  }
}
