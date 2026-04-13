# AGENTS.md

> LLM Executables - Unix programs powered by LLMs

## Repo
`lmx` is a TypeScript CLI for creating, building, installing, running, and benchmarking LLM executables powered by Pi.

## Edit Targets
Prefer modifying:
- `src/` — main TypeScript implementation
- `src/commands/` — CLI command entrypoints
- `src/lib/` — shared runtime, program loading, schemas, help generation, paths, and execution logic
- `scripts/` — build/support scripts
- `built-ins/` — built-in LMX programs, if/when present in this repo

Avoid modifying:
- `dist/` (generated)
- `node_modules/`

## Reference Paths
Useful for context, debugging, or behavior checks:
- `package.json` — scripts, dependencies, and CLI entrypoint
- `tsconfig.json` — TypeScript compiler settings
- `lmx-spec.md` — product/spec reference for expected runtime and CLI behavior
- `roadmap.md` — planned work, including built-ins direction

## Working Rules
- Make small, focused changes.
- Prefer source changes over generated-file edits.
- Do not edit `dist/` unless the task explicitly requires generated output updates.
- Keep behavior aligned with `lmx-spec.md`.
- Keep CLI behavior Unix-friendly: stdout for normal output, stderr for diagnostics.
- Preserve exit code behavior where possible.
- Avoid unrelated refactors.

## Validation
Run:
- `npm run check`
- `npm run build`

If command behavior changes, also test the affected command manually.

## Agent Notes
- If command behavior, help text, config semantics, or exit behavior changes, check whether `lmx-spec.md` should also be updated.
- Keep patches minimal and easy to review.
