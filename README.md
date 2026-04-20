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
- Use the generated `*.cmd` wrappers when invoking built programs from Command Prompt or PowerShell.

## Setup

```bash
npm install
npm run build
```

## Run

```bash
node dist/cli.js --help
```

Or:

```bash
npm run dev -- --help
```

## Notes

- npm publishing: TBD
- install pipeline: TBD
- On Windows, Pi requires bash, so install Git Bash.
- `lmx build` now generates both the Unix shim (`<program>`) and a Windows wrapper (`<program>.cmd`).
