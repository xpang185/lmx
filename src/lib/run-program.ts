import { AuthStorage, createAgentSession, DefaultResourceLoader, getAgentDir, ModelRegistry, SessionManager } from "@mariozechner/pi-coding-agent";

import type { RuntimeConfig } from "./global-config.js";
import { LmxError, EXIT_RUNTIME, EXIT_USAGE } from "./errors.js";
import { getParamEntries, type ParamValue } from "./invocation.js";
import type { LoadedProgram } from "./program.js";
import type { ParamConfig } from "./schemas.js";

export interface EffectiveParam {
  config: ParamConfig;
  value: ParamValue;
  source: "user" | "default";
}

export interface ProgramExecutionOptions {
  modelOverride?: string;
  temperature?: number;
  verbose?: boolean;
  input: string;
  providedParams?: Record<string, ParamValue>;
}

export interface ProgramExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  modelRef: string;
}

function parseModelRef(modelRef: string): { provider: string; modelId: string } {
  const [provider, ...modelParts] = modelRef.split("/");
  const modelId = modelParts.join("/");
  if (!provider || !modelId) {
    throw new LmxError(`Invalid model reference: ${modelRef}`, EXIT_USAGE);
  }

  return { provider, modelId };
}

function resolveToolNames(program: LoadedProgram): string[] {
  if (program.config.tools.includes("none")) {
    return [];
  }

  return program.config.tools;
}

function parseValueForParam(name: string, config: ParamConfig, raw: ParamValue): ParamValue {
  switch (config.type) {
    case "string": {
      if (typeof raw !== "string") {
        throw new LmxError(`--${name} expects a string`, EXIT_USAGE);
      }
      return raw;
    }
    case "number": {
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(value)) {
        throw new LmxError(`--${name} expects a number`, EXIT_USAGE);
      }
      return value;
    }
    case "boolean": {
      if (typeof raw === "boolean") {
        return raw;
      }

      if (raw === "true") {
        return true;
      }
      if (raw === "false") {
        return false;
      }

      throw new LmxError(`--${name} expects true or false`, EXIT_USAGE);
    }
  }
}

function validateEnum(name: string, config: ParamConfig, value: ParamValue): void {
  if (!config.enum) {
    return;
  }

  if (!config.enum.some((option) => option === value)) {
    throw new LmxError(`--${name} must be one of: ${config.enum.join(", ")}`, EXIT_USAGE);
  }
}

export function resolveEffectiveParams(
  program: LoadedProgram,
  providedParams: Record<string, ParamValue> = {},
): Record<string, EffectiveParam> {
  const effective: Record<string, EffectiveParam> = {};
  const paramEntries = getParamEntries(program);
  const paramConfigs = new Map(paramEntries.map((entry) => [entry.name, entry]));

  for (const providedKey of Object.keys(providedParams)) {
    if (!paramConfigs.has(providedKey)) {
      throw new LmxError(`Unknown option: --${providedKey}`, EXIT_USAGE);
    }
  }

  for (const { name, config, kind } of paramEntries) {
    if (Object.prototype.hasOwnProperty.call(providedParams, name)) {
      const value = parseValueForParam(name, config, providedParams[name]!);
      validateEnum(name, config, value);
      effective[name] = { config, value, source: "user" };
      continue;
    }

    if (config.default !== undefined) {
      effective[name] = {
        config,
        value: config.default,
        source: "default",
      };
      continue;
    }

    if (config.required) {
      const label = kind === "argument" ? `argument: <${name}>` : `option: --${name}`;
      throw new LmxError(`Missing required ${label}`, EXIT_USAGE);
    }
  }

  return effective;
}

function formatParamValue(value: ParamValue): string {
  return typeof value === "string" ? value : String(value);
}

export function composeInvocationContext(program: LoadedProgram, params: Record<string, EffectiveParam>, input: string): string {
  const sections: string[] = [];
  sections.push("Parameters:");

  const paramEntries = Object.entries(params);
  if (paramEntries.length === 0) {
    sections.push("- none");
  } else {
    for (const [name, param] of paramEntries) {
      sections.push(`- ${name} (${param.config.description}): ${formatParamValue(param.value)} (${param.source})`);
    }
  }

  sections.push("");
  sections.push("Input:");
  sections.push(input);
  return `${sections.join("\n")}\n`;
}

async function resolveModel(program: LoadedProgram, runtime: RuntimeConfig, override?: string) {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const configuredRef = override ?? program.config.default_model ?? runtime.raw.default_model;

  if (configuredRef) {
    const { provider, modelId } = parseModelRef(configuredRef);
    const model = modelRegistry.find(provider, modelId);
    if (!model) {
      throw new LmxError(`Unknown model: ${configuredRef}`, EXIT_USAGE);
    }

    return { authStorage, modelRegistry, model, modelRef: `${model.provider}/${model.id}` };
  }

  const available = await modelRegistry.getAvailable();
  if (available.length === 0) {
    throw new LmxError("No model configured. Set default_model in config or pass --model.", EXIT_RUNTIME);
  }

  const model = available[0]!;
  return { authStorage, modelRegistry, model, modelRef: `${model.provider}/${model.id}` };
}

export async function executeProgram(
  program: LoadedProgram,
  runtime: RuntimeConfig,
  options: ProgramExecutionOptions,
): Promise<ProgramExecutionResult> {
  if (options.temperature !== undefined) {
    throw new LmxError("Temperature overrides are not supported by the current Pi SDK session API yet.", EXIT_USAGE);
  }

  const params = resolveEffectiveParams(program, options.providedParams);
  const promptInput = composeInvocationContext(program, params, options.input);
  const { authStorage, modelRegistry, model, modelRef } = await resolveModel(program, runtime, options.modelOverride);
  const agentDir = getAgentDir();

  const loader = new DefaultResourceLoader({
    cwd: program.dir,
    agentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    promptsOverride: () => ({ prompts: [], diagnostics: [] }),
    themesOverride: () => ({ themes: [], diagnostics: [] }),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () => program.prompt.replaceAll("{baseDir}", program.dir),
    appendSystemPromptOverride: () => [],
  });
  await loader.reload();

  const stderrLines: string[] = [];
  if (options.verbose) {
    stderrLines.push(`program: ${program.config.name}`);
    stderrLines.push(`dir: ${program.dir}`);
    stderrLines.push(`model: ${modelRef}`);
  }

  let stdout = "";
  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: program.dir,
    agentDir,
    authStorage,
    modelRegistry,
    model,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(program.dir),
    tools: resolveToolNames(program),
  });

  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      stdout += event.assistantMessageEvent.delta;
    }
  });

  if (modelFallbackMessage && options.verbose) {
    stderrLines.push(modelFallbackMessage);
  }

  try {
    await session.prompt(promptInput, { expandPromptTemplates: false });
    return {
      stdout,
      stderr: stderrLines.join("\n"),
      exitCode: 0,
      modelRef,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (stderrLines.length > 0) {
      stderrLines.push(message);
    }
    return {
      stdout,
      stderr: stderrLines.length > 0 ? stderrLines.join("\n") : message,
      exitCode: EXIT_RUNTIME,
      modelRef,
    };
  } finally {
    session.dispose();
  }
}
