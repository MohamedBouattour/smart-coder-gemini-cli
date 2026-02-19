# Gemini CLI Benchmark

Standalone benchmark suite for comparing Gemini CLI performance with and without
Smart Mode.

## Structure

```
cli-benchmark/
├── prompts.json              ← Single source of truth for all benchmark prompts
├── run-benchmark.js          ← Benchmark runner script
├── README.md
├── projects/
│   ├── _template/            ← Clean source code (auto-copied before each run)
│   ├── angular-ddd/          ← Baseline project (smart mode OFF)
│   └── angular-ddd-smart/    ← Smart mode project (smart mode ON)
└── results/                  ← Timestamped run metadata files
```

## How It Works

1. Before each project run, the runner **resets** `src/` from
   `projects/_template/src/` so both projects start from identical, clean source
   code.
2. Each prompt is run via the Gemini CLI's `--prompt` non-interactive mode.
3. **Live status** is displayed showing elapsed time and what the CLI is doing
   (reading files, writing files, thinking, etc.)
4. Failed prompts are **retried** automatically (default: 2 retries).
5. Results are saved to `benchmark.result.json` in each project and aggregated
   metadata goes to `results/`.

## Quick Start

```bash
# Run the full benchmark (both projects, all prompts)
node run-benchmark.js

# Run with full CLI output visible
node run-benchmark.js --verbose

# Run only the baseline project
node run-benchmark.js --only baseline

# Run only the smart mode project
node run-benchmark.js --only smart

# Run a specific prompt
node run-benchmark.js --prompt-id bug-fix-domain

# Skip resetting (keep modified code from last run)
node run-benchmark.js --no-reset

# Dry run (preview what would be executed)
node run-benchmark.js --dry-run
```

## Options

| Flag                  | Default     | Description                           |
| --------------------- | ----------- | ------------------------------------- |
| `--timeout <ms>`      | `480000`    | Per-prompt timeout in ms (8 min)      |
| `--retries <n>`       | `2`         | Max retries for failed prompts        |
| `--only <project>`    | —           | Run only `"baseline"` or `"smart"`    |
| `--prompt-id <id>`    | —           | Run only a specific prompt by ID      |
| `--dry-run`           | `false`     | Preview without executing             |
| `--approval-mode <m>` | `"yolo"`    | Approval mode passed to the CLI       |
| `--cli-path <path>`   | auto-detect | Path to Gemini CLI `start.js`         |
| `--no-reset`          | `false`     | Skip resetting projects from template |
| `--verbose`           | `false`     | Show full CLI stdout/stderr output    |

## Template

The `projects/_template/` directory contains the clean, unmodified source code.
Before each project run, the runner copies `_template/src/` → `<project>/src/`
to ensure a deterministic starting point.

To update the template, just edit files in `projects/_template/src/`.

## Prompts

All prompts are defined in `prompts.json`. Each prompt has:

- **`id`** — Unique identifier
- **`category`** — Human-readable category name
- **`prompt`** — The actual prompt sent to the CLI

## Results

Results are generated in two places:

1. **Per-project** — `projects/<name>/benchmark.result.json` (written by the
   CLI's BenchmarkLogger)
2. **Run metadata** — `results/run-<timestamp>.json` (aggregated summary of each
   run)

## CLI Path

By default, the runner looks for `../scripts/start.js` relative to this
directory. If your Gemini CLI checkout is in a different location, use
`--cli-path`:

```bash
node run-benchmark.js --cli-path /path/to/smart-coder-gemini-cli/scripts/start.js
```
