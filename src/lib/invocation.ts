import { readFile } from "node:fs/promises";
import path from "node:path";

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

export async function expandAtFileReference(value: string, cwd: string): Promise<string> {
  if (value.startsWith("@@")) {
    return value.slice(1);
  }

  if (!value.startsWith("@")) {
    return value;
  }

  const fileRef = value.slice(1);
  if (fileRef.length === 0) {
    throw new LmxError("Empty @file reference", EXIT_USAGE);
  }

  const filePath = path.resolve(cwd, fileRef);
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LmxError(`Unable to read @file reference ${value}: ${message}`, EXIT_USAGE);
  }
}

export async function expandAtFileReferences(
  values: Record<string, ParamValue>,
  cwd: string,
): Promise<Record<string, ParamValue>> {
  const expanded: Record<string, ParamValue> = {};

  for (const [name, value] of Object.entries(values)) {
    expanded[name] = typeof value === "string" ? await expandAtFileReference(value, cwd) : value;
  }

  return expanded;
}
