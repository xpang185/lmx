import { parseDocument, stringify } from "yaml";

import { LmxError, EXIT_USAGE } from "./errors.js";

export function parseYamlFile<T>(content: string, label: string): T {
  const document = parseDocument(content);
  if (document.errors.length > 0) {
    throw new LmxError(`Invalid YAML in ${label}: ${document.errors[0]?.message ?? "unknown error"}`, EXIT_USAGE);
  }

  return document.toJS() as T;
}

export function stringifyYaml(value: unknown): string {
  return stringify(value, {
    defaultStringType: "QUOTE_DOUBLE",
    lineWidth: 0,
  });
}
