import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RuntimeConfig } from "./global-config.js";
import { getRunnerCliPath } from "./paths.js";
import { buildProgram, loadProgram } from "./program.js";

function quoteForSh(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function generateInstalledShimScript(programDir: string, runnerCliPath: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail

PROGRAM_DIR=${quoteForSh(programDir)}
RUNNER_CLI=${quoteForSh(runnerCliPath)}

exec node "$RUNNER_CLI" run "$PROGRAM_DIR" "$@"
`;
}

function generateInstalledCmdShimScript(programDir: string, runnerCliPath: string): string {
  return `@echo off
setlocal
set "PROGRAM_DIR=${programDir}"
set "RUNNER_CLI=${runnerCliPath}"

call node "%RUNNER_CLI%" run "%PROGRAM_DIR%" %*
exit /b %ERRORLEVEL%
`;
}

export async function installProgram(programDir: string, runtime: RuntimeConfig): Promise<string[]> {
  await buildProgram(programDir);
  const program = await loadProgram(programDir);
  const runnerCliPath = await getRunnerCliPath();
  const installedPaths: string[] = [];

  if (process.platform === "win32") {
    const targetPath = path.join(runtime.binDir, `${program.config.name}.cmd`);
    await writeFile(targetPath, generateInstalledCmdShimScript(program.dir, runnerCliPath), "utf8");
    installedPaths.push(targetPath);
    return installedPaths;
  }

  const targetPath = path.join(runtime.binDir, program.config.name);
  await writeFile(targetPath, generateInstalledShimScript(program.dir, runnerCliPath), "utf8");
  await chmod(targetPath, 0o755);
  installedPaths.push(targetPath);
  return installedPaths;
}

export function isBinDirOnPath(binDir: string): boolean {
  const pathValue = process.env.PATH ?? "";
  const entries = pathValue.split(path.delimiter).filter((entry) => entry.length > 0);
  const normalizedBinDir = path.resolve(binDir);

  return entries.some((entry) => path.resolve(entry) === normalizedBinDir);
}
