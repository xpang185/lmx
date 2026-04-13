# LMX Roadmap

## MVP

Goal: prove LMX as a lightweight TypeScript wrapper around Pi for Unix-style LLM programs.

- TypeScript implementation with a thin `src/` runner around the Pi SDK
- Pi-only runtime for execution, auth, and model resolution
- Keep `src/` lightweight
- Add a `built-ins/` folder for built-in LMX programs
- Standard LMX program shape: `LMX.md`, `config.yaml`, generated shim/help, optional scripts, benchmark files
- Core runner flow for `run`, `create`, `build`, `install`, `uninstall`, and `bench`
- Built-in `judge` as a core primitive
- `bench` invokes `judge`
- Built-in program: `summarize`
- Built-in program: `classify`
- `summarize` and `classify` should demonstrate Unix composability through stdin and positional input, not convenience flags like `--file` or `--url`
- Defer a separate `examples/` area until there is clear need for it

## Roadmap

- `auto-lmx`
  Hill-climbing improvement loop over benchmarks, similar in spirit to AutoResearch. This is a core long-term direction, not just an add-on tool.
- `skill-to-lmx`
  Convert an LLM skill into an LMX program skeleton.
- `mcp-to-lmx`
  Convert an MCP tool or MCP-oriented interface into an LMX program skeleton.

## Backlog

- `trace-to-bench`
  Turn real runs, failures, and observed edge cases into benchmark candidates.
- `rubric-to-bench`
  Generate benchmark structure from a rubric and examples, consolidating the earlier `rubric-to-judge` and `example-to-bench` ideas.
- `propose`
  Given a goal, the agent or program being assessed, observations, and the current reward or rubric, propose the next change to try.
- `compare`
  Compare two prompts, models, or LMX variants against the same rubric or benchmark.
- `lmx-lint`
  Validate prompt/config/bench quality, weak param descriptions, inconsistent tool declarations, and missing coverage.
- `bench-diff`
  Compare benchmark runs across revisions or models and explain what changed.
- `stress`
  Generate adversarial or edge-case benchmark inputs from an existing program or rubric.
- `shrink`
  Reduce a failing benchmark case to the smallest useful repro.
- `explain-score`
  Explain why `judge` produced a particular score or decision.
