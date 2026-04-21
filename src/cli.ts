#!/usr/bin/env node

import { runBenchCommand } from "./commands/bench.js";
import { runBuildCommand } from "./commands/build.js";
import { runCreateCommand } from "./commands/create.js";
import { runListCommand } from "./commands/list.js";
import { runRunCommand } from "./commands/run.js";
import { LmxError, EXIT_USAGE } from "./lib/errors.js";
import { runEntrypoint } from "./lib/entrypoint.js";

function usage(): string {
  return `lmx <command> [args...]

Commands:
  create <name>
  build <name|path>
  bench <name> [--model provider/id]
  bench --all [--model provider/id]
  run <program-dir> [args...]
  list
`;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "--help" || command === "help") {
    process.stdout.write(usage());
    return;
  }

  switch (command) {
    case "create":
      await runCreateCommand(args);
      return;
    case "build":
      await runBuildCommand(args);
      return;
    case "bench":
      await runBenchCommand(args);
      return;
    case "run":
      await runRunCommand(args);
      return;
    case "list":
      await runListCommand(args);
      return;
    default:
      throw new LmxError(`Unknown command: ${command}`, EXIT_USAGE);
  }
}

await runEntrypoint(main);
