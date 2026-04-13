import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { LmxError, EXIT_USAGE } from "./errors.js";
import { globalConfigSchema, type GlobalConfig } from "./schemas.js";
import { getDefaultBinDir, getDefaultLmxHome, getDefaultProgramsDir, expandHome, pathExists } from "./paths.js";
import { parseYamlFile } from "./yaml.js";

export interface RuntimeConfig {
  filePath: string;
  raw: GlobalConfig;
  lmxHome: string;
  programsDir: string;
  binDir: string;
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const lmxHome = getDefaultLmxHome();
  const filePath = path.join(lmxHome, "config.yaml");
  const raw = (await pathExists(filePath))
    ? globalConfigSchema.parse(parseYamlFile<unknown>(await readFile(filePath, "utf8"), filePath))
    : {};

  const result = {
    filePath,
    raw,
    lmxHome,
    programsDir: expandHome(raw.programs_dir ?? getDefaultProgramsDir()),
    binDir: expandHome(raw.bin_dir ?? getDefaultBinDir()),
  };

  if (!path.isAbsolute(result.programsDir) || !path.isAbsolute(result.binDir)) {
    throw new LmxError("programs_dir and bin_dir must resolve to absolute paths", EXIT_USAGE);
  }

  return result;
}

export async function ensureRuntimeDirs(config: RuntimeConfig): Promise<void> {
  await mkdir(config.lmxHome, { recursive: true });
  await mkdir(config.programsDir, { recursive: true });
  await mkdir(config.binDir, { recursive: true });
}
