#!/usr/bin/env node

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runNamedProgramCommand } from "../../commands/run.js";
import { runEntrypoint } from "../../lib/entrypoint.js";

const programDir = dirname(fileURLToPath(import.meta.url));

await runEntrypoint(() => runNamedProgramCommand(programDir, process.argv.slice(2)));
