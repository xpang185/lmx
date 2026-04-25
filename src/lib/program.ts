import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateHelpText } from "./help.js";
import { LmxError, EXIT_USAGE } from "./errors.js";
import { type ProgramConfig, programConfigSchema } from "./schemas.js";
import { loadRuntimeConfig, ensureRuntimeDirs, type RuntimeConfig } from "./global-config.js";
import { getBuiltInProgramsDir, pathExists } from "./paths.js";
import { parseYamlFile, stringifyYaml } from "./yaml.js";

export interface LoadedProgram {
  dir: string;
  configPath: string;
  promptPath: string;
  helpPath: string;
  runnerPath: string;
  config: ProgramConfig;
  prompt: string;
}

export async function createRuntime(): Promise<RuntimeConfig> {
  const config = await loadRuntimeConfig();
  await ensureRuntimeDirs(config);
  return config;
}

async function listProgramNamesInDir(baseDir: string): Promise<string[]> {
  if (!(await pathExists(baseDir))) {
    return [];
  }

  const entries = await readdir(baseDir, { withFileTypes: true });
  const result: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const configPath = path.join(baseDir, entry.name, "config.yaml");
    if (await pathExists(configPath)) {
      result.push(entry.name);
    }
  }

  return result;
}

export async function listProgramNames(runtime: RuntimeConfig): Promise<string[]> {
  const [userPrograms, builtIns] = await Promise.all([
    listProgramNamesInDir(runtime.programsDir),
    listProgramNamesInDir(await getBuiltInProgramsDir()),
  ]);

  return [...new Set([...userPrograms, ...builtIns])].sort();
}

export async function resolveProgramDir(ref: string, runtime: RuntimeConfig): Promise<string> {
  const directPath = path.resolve(ref);
  if (await pathExists(directPath)) {
    const info = await stat(directPath);
    if (info.isDirectory()) {
      return directPath;
    }
  }

  const byName = path.join(runtime.programsDir, ref);
  if (await pathExists(byName)) {
    return byName;
  }

  const builtInByName = path.join(await getBuiltInProgramsDir(), ref);
  if (await pathExists(builtInByName)) {
    return builtInByName;
  }

  throw new LmxError(`Unknown program: ${ref}`, EXIT_USAGE);
}

export async function loadProgram(programDir: string): Promise<LoadedProgram> {
  const configPath = path.join(programDir, "config.yaml");
  const promptPath = path.join(programDir, "LMX.md");
  const helpPath = path.join(programDir, "_help.txt");
  const runnerPath = path.join(programDir, "_run.js");

  if (!(await pathExists(configPath))) {
    throw new LmxError(`Missing config.yaml in ${programDir}`, EXIT_USAGE);
  }

  if (!(await pathExists(promptPath))) {
    throw new LmxError(`Missing LMX.md in ${programDir}`, EXIT_USAGE);
  }

  const parsedConfig = parseYamlFile<unknown>(await readFile(configPath, "utf8"), configPath);
  const config = programConfigSchema.parse(parsedConfig);
  const prompt = await readFile(promptPath, "utf8");

  return {
    dir: programDir,
    configPath,
    promptPath,
    helpPath,
    runnerPath,
    config,
    prompt,
  };
}

function getProgramRunnerTemplatePath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../templates/program-runner.js");
}

export async function buildProgram(programDir: string): Promise<LoadedProgram> {
  const program = await loadProgram(programDir);
  const helpText = await generateHelpText(programDir, program.config);

  await writeFile(program.helpPath, helpText, "utf8");
  await copyFile(getProgramRunnerTemplatePath(), program.runnerPath);
  await rm(path.join(program.dir, "help.txt"), { force: true });

  return program;
}

function validateProgramName(name: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new LmxError("Program names must match ^[a-z0-9][a-z0-9-]*$", EXIT_USAGE);
  }
}

export async function createProgram(name: string, runtime: RuntimeConfig): Promise<string> {
  validateProgramName(name);

  const programDir = path.join(runtime.programsDir, name);
  if (await pathExists(programDir)) {
    throw new LmxError(`Program already exists: ${name}`, EXIT_USAGE);
  }

  await mkdir(path.join(programDir, "bench", "cases"), { recursive: true });
  await mkdir(path.join(programDir, "bench", "results"), { recursive: true });
  await mkdir(path.join(programDir, "scripts"), { recursive: true });

  const config: ProgramConfig = {
    name,
    description: `Describe what ${name} does`,
    version: "0.1.0",
    default_model: runtime.raw.default_model,
    input: {},
    positionals: [],
    tools: ["none"],
    params: {
      instructions: {
        description: "Additional instructions for the program",
        type: "string",
      },
    },
  };

  const prompt = `# ${name}

You are the Unix command \`${name}\`.

Read the Input section and produce only the command output.
Do not add a preamble, explanation, or markdown fences unless the user explicitly asks for them in the input or parameters.
`;

  const benchCase = {
    input: "replace this with a representative example input",
    rubrics: [
      {
        rubric: "the output satisfies the program's intended behavior",
      },
    ],
  };

  await writeFile(path.join(programDir, "config.yaml"), stringifyYaml(config), "utf8");
  await writeFile(path.join(programDir, "LMX.md"), prompt, "utf8");
  await writeFile(path.join(programDir, "bench", "cases", "basic-smoke.yaml"), stringifyYaml(benchCase), "utf8");

  await buildProgram(programDir);
  return programDir;
}
