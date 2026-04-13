import { chmod, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const sourceDir = path.join(rootDir, "built-ins");
const targetDir = path.join(rootDir, "dist", "built-ins");
const legacyTargetDir = path.join(rootDir, "dist", "built-in");
const cliPath = path.join(rootDir, "dist", "cli.js");

await mkdir(path.dirname(targetDir), { recursive: true });
await rm(targetDir, { recursive: true, force: true });
await rm(legacyTargetDir, { recursive: true, force: true });
await cp(sourceDir, targetDir, { recursive: true });
await chmod(cliPath, 0o755);
