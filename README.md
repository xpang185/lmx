# lmx

LLM executables: Unix-style commands powered by Pi.

`lmx` lets you package prompts as normal command-line programs. The package also ships three built-ins: `summarize`, `classify`, and `judge`.

## Install

```bash
npm install -g @xpang/lmx
lmx --help
```

Requirements:

- Node.js and npm
- Pi auth already configured on the machine
- Windows: Git Bash / Git for Windows, because Pi needs bash

## Quick Start

```bash
summarize "LMX turns prompts into normal command-line tools."
summarize < README.md
```

```bash
echo "The payment page crashes after submit" | classify --labels "bug,feature,question"
```

```bash
summarize < README.md | judge "contains all the built-ins"
summarize < README.md | judge "contains npm install instructions"
```

Built-ins default to `openai-codex/gpt-5.5`. Override the model when needed:

```bash
summarize --model openai-codex/gpt-5.5 "Summarize this."
```

## Built-In Commands

### `summarize`

Summarize text from an argument or stdin.

```bash
summarize "Long text..."
echo "Long text..." | summarize --instructions "one sentence"
```

### `classify`

Classify text into one of the labels you provide.

```bash
classify --labels "bug,feature,question" "Add dark mode"
```

### `judge`

Evaluate a candidate against a rubric. Output is `MET` or `UNMET`.

```bash
judge "The candidate must be concise." "Short and accurate."
echo "Short and accurate." | judge "The candidate must be concise."
summarize < README.md | judge "The summary must mention installation."
```

## CLI

```bash
lmx create <name>
lmx build <name|path>
lmx bench <name> [--model provider/id]
lmx bench --all [--model provider/id]
lmx run <program-dir> [args...]
lmx list
```

Most users call installed programs directly, such as `summarize`, instead of calling `lmx run`.

## What Is an LMX Program?

An LMX program is a folder with a prompt and config:

```text
my-tool/
  LMX.md
  config.yaml
  bench/
```

`LMX.md` contains the program instructions. `config.yaml` defines metadata, parameters, tools, and the default model. `lmx build` validates the program and generates npm-ready entrypoints.

## Local Development

Clone the repo:

```bash
git clone https://github.com/xpang185/lmx.git
cd lmx
```

Install and build:

```bash
npm install
npm run build
```

Run the CLI from source:

```bash
npm run dev -- --help
npm run dev -- run built-ins/summarize "Text to summarize"
```

Link the package locally:

```bash
npm link
lmx --help
summarize --help
```

On Windows, `lmx.cmd` is available at the repo root after checkout, so `lmx ...` works from `cmd.exe` while your current directory is the repo root.

## Validation

```bash
npm run check
npm run build
```

If command behavior changes, also test the affected command manually.

## Releases

Normal commits land on `main`. Release Please keeps a release PR open with the next npm version and changelog.

When you are ready to publish, merge the release PR. The GitHub release workflow then creates the tag/release and runs `npm publish`.
