import os from "node:os";
import path from "node:path";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { fileURLToPath } from "node:url";

import { LmxError, EXIT_RUNTIME } from "./errors.js";

export function expandHome(inputPath: string): string {
  if (inputPath === "~") {
    return os.homedir();
  }

  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

export function getDefaultLmxHome(): string {
  return path.join(os.homedir(), ".lmx");
}

export function getDefaultProgramsDir(): string {
  return path.join(getDefaultLmxHome(), "programs");
}

export function getDefaultBinDir(): string {
  return path.join(os.homedir(), ".local", "bin");
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function getBuiltInProgramsDir(): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../../built-ins"),
    path.resolve(moduleDir, "../built-ins"),
    path.resolve(moduleDir, "../../built-in"),
    path.resolve(moduleDir, "../built-in"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new LmxError("Unable to locate bundled built-ins", EXIT_RUNTIME);
}
