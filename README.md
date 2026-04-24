# lmx

WIP: LLM executables powered by Pi.

## Clone

```bash
git clone https://github.com/xpang185/lmx.git
cd lmx
```

## Prerequisites

All platforms:
- Node.js + npm: https://nodejs.org/en/download

Windows:
- Git Bash / Git for Windows: https://git-scm.com/download/win

## Setup

```bash
npm install
npm run build
npm link
```

## Install

```bash
npm install -g @xpang/lmx
lmx --help
```

## Run

```bash
node dist/cli.js --help
```

Or:

```bash
npm run dev -- --help
```

For local development in the repo on Windows, `lmx.cmd` is available at the repo root after checkout, so `lmx ...` works from `cmd.exe` while your current directory is the repo root.

After `npm link`, npm exposes `lmx` plus the bundled built-ins (`judge`, `summarize`, `classify`) as normal commands on your PATH.

## Notes

- install pipeline: TBD
- On Windows, Pi requires bash, so install Git Bash.
- `lmx build` validates the program and regenerates `_help.txt` plus the program `_run.js` npm entrypoint.
- npm owns PATH shims for `lmx` and bundled built-ins via `package.json#bin`.
