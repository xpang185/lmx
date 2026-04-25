import { LmxError, EXIT_USAGE } from "./errors.js";
import type { LoadedProgram } from "./program.js";
import type { ParamConfig } from "./schemas.js";

export type ParamValue = string | number | boolean;

export interface ParamEntry {
  name: string;
  config: ParamConfig;
  kind: "argument" | "option";
}

export function getParamEntries(program: LoadedProgram): ParamEntry[] {
  return [
    ...program.config.positionals.map((config) => ({
      name: config.name,
      config,
      kind: "argument" as const,
    })),
    ...Object.entries(program.config.params).map(([name, config]) => ({
      name,
      config,
      kind: "option" as const,
    })),
  ];
}

export function assignPositionalParams(
  program: LoadedProgram,
  positionals: string[],
): { providedParams: Record<string, ParamValue>; inputPositionals: string[] } {
  const providedParams: Record<string, ParamValue> = {};
  let cursor = 0;

  for (const config of program.config.positionals) {
    const value = positionals[cursor];
    if (value === undefined) {
      if (config.required) {
        throw new LmxError(`Missing required argument: <${config.name}>`, EXIT_USAGE);
      }
      continue;
    }

    providedParams[config.name] = value;
    cursor += 1;
  }

  return {
    providedParams,
    inputPositionals: positionals.slice(cursor),
  };
}

export function combineInput(positionals: string[], stdin: string): string {
  const parts: string[] = [];
  if (positionals.length > 0) {
    parts.push(positionals.join(" "));
  }
  if (stdin.length > 0) {
    parts.push(stdin);
  }
  return parts.join("\n\n");
}
