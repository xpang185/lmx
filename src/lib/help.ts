import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { ProgramConfig } from "./schemas.js";
import { parseYamlFile } from "./yaml.js";
import { pathExists } from "./paths.js";

interface BenchSummary {
  model: string;
  score: number;
}

async function loadBenchSummaries(programDir: string): Promise<BenchSummary[]> {
  const resultsDir = path.join(programDir, "bench", "results");
  if (!(await pathExists(resultsDir))) {
    return [];
  }

  const entries = await readdir(resultsDir, { withFileTypes: true });
  const summaries: BenchSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".yaml")) {
      continue;
    }

    const filePath = path.join(resultsDir, entry.name);
    const parsed = parseYamlFile<{ model?: string; overall?: { score?: number } }>(await readFile(filePath, "utf8"), filePath);
    if (parsed.model && typeof parsed.overall?.score === "number") {
      summaries.push({ model: parsed.model, score: parsed.overall.score });
    }
  }

  summaries.sort((left, right) => right.score - left.score);
  return summaries;
}

export async function generateHelpText(programDir: string, config: ProgramConfig): Promise<string> {
  const lines: string[] = [];
  const inputLabel = config.input.label ?? "input";
  const inputUsage = `[${inputLabel.toUpperCase()}]`;
  const positionalUsage = config.positionals.map((param) => (param.required ? `<${param.name}>` : `[${param.name}]`));
  const usageParts = [config.name, "[OPTIONS]", ...positionalUsage, inputUsage];
  const inputDescription = config.input.description ?? "Input";
  const hasArguments = config.positionals.length > 0;

  lines.push(`${config.name} - ${config.description}`);
  lines.push("");
  lines.push(`Usage: ${usageParts.join(" ")}`);
  lines.push("");
  lines.push(
    hasArguments
      ? `${inputDescription} can be provided as ${inputUsage} or piped via stdin.`
      : `${inputDescription} can be provided as an argument or piped via stdin.`,
  );
  lines.push("");

  if (hasArguments) {
    const argumentRows = config.positionals.map((param) => {
      const label = param.required ? `<${param.name}>` : `[${param.name}]`;
      const typeText = param.type === "string" ? "" : ` (${param.type})`;
      const enumText = param.enum?.length ? ` Options: ${param.enum.join(", ")}.` : "";
      const defaultText = param.default !== undefined ? ` (default: ${String(param.default)})` : "";
      return {
        label,
        description: `${param.description}${typeText}${enumText}${defaultText}`,
      };
    });
    argumentRows.push({
      label: inputUsage,
      description: `${inputDescription}, or pipe ${inputLabel} via stdin`,
    });
    const labelWidth = Math.max(...argumentRows.map((row) => row.label.length));

    lines.push("Arguments:");
    for (const row of argumentRows) {
      lines.push(`  ${row.label.padEnd(labelWidth)}   ${row.description}`);
    }
    lines.push("");
  }

  lines.push("Options:");

  for (const [name, param] of Object.entries(config.params)) {
    const typeLabel = param.type === "boolean" ? "" : ` <${param.type}>`;
    const enumText = param.enum?.length ? ` Options: ${param.enum.join(", ")}.` : "";
    const defaultText = param.default !== undefined ? ` (default: ${String(param.default)})` : "";
    lines.push(`  --${name}${typeLabel}    ${param.description}${enumText}${defaultText}`);
  }

  lines.push("  --model <provider/id>   Override the LLM model");
  lines.push("  --temperature <float>   Override temperature");
  lines.push("  --verbose               Show runner diagnostics on stderr");
  lines.push("  --help                  Show this help text");

  const benchSummaries = await loadBenchSummaries(programDir);
  if (benchSummaries.length > 0) {
    benchSummaries.sort((left, right) => {
      const scoreOrder = right.score - left.score;
      if (scoreOrder !== 0) {
        return scoreOrder;
      }
      if (left.model === config.default_model) {
        return -1;
      }
      if (right.model === config.default_model) {
        return 1;
      }
      return left.model.localeCompare(right.model);
    });

    lines.push("");
    lines.push("Tested models:");

    const recommended = benchSummaries[0];
    for (const summary of benchSummaries) {
      const suffix = summary === recommended ? " (recommended)" : "";
      lines.push(`  ${summary.model}   score: ${summary.score.toFixed(2)}${suffix}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
