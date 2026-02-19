/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Gemini CLI Benchmark Runner
 * ===========================
 * Runs prompts from the single `prompts.json` against two project variants:
 *   - projects/angular-ddd         (smart mode OFF — baseline)
 *   - projects/angular-ddd-smart   (smart mode ON)
 *
 * Before each project run, the `src/` directory is reset from `projects/_template/src/`
 * to ensure both projects start from identical, clean source code.
 *
 * Results are:
 *   1. Written to `benchmark.result.json` in each project root
 *      by the CLI's built-in BenchmarkLogger.
 *   2. Aggregated metadata saved to `results/run-<timestamp>.json`.
 *
 * Usage:
 *   node run-benchmark.js [options]
 *
 * Options:
 *   --timeout <ms>      Per-prompt timeout in ms (default: 480000 = 8 min)
 *   --retries <n>       Max retries for failed prompts (default: 2)
 *   --only <project>    Run only one project: "baseline" or "smart"
 *   --prompt-id <id>    Run only the prompt with this ID
 *   --dry-run           Print what would be run without executing
 *   --approval-mode <m> Approval mode passed to the CLI (default: "yolo")
 *   --cli-path <path>   Path to Gemini CLI start.js (default: auto-detect)
 *   --no-reset          Skip resetting projects from template
 *   --verbose           Show full CLI output (default: show summary lines)
 */

import { spawn, execSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Paths ──────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_FILE = join(__dirname, 'prompts.json');
const PROJECTS_DIR = join(__dirname, 'projects');
const RESULTS_DIR = join(__dirname, 'results');
const TEMPLATE_DIR = join(PROJECTS_DIR, '_template');

// Default CLI path: the Gemini CLI entry point in the parent repo.
// Adjust via --cli-path if your layout differs.
const DEFAULT_CLI_PATH = resolve(
  __dirname,
  '..',
  'packages',
  'cli',
  'dist',
  'index.js',
);

const PROJECTS = [
  {
    name: 'angular-ddd',
    label: 'Baseline (smart OFF)',
    dir: join(PROJECTS_DIR, 'angular-ddd'),
    smartMode: false,
  },
  {
    name: 'angular-ddd-smart',
    label: 'Smart Mode (smart ON)',
    dir: join(PROJECTS_DIR, 'angular-ddd-smart'),
    smartMode: true,
  },
];

// ─── CLI Args Parsing ───────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    timeout: 480_000,
    retries: 2,
    only: null,
    promptId: null,
    dryRun: false,
    approvalMode: 'yolo',
    cliPath: DEFAULT_CLI_PATH,
    noReset: false,
    verbose: false,
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--timeout':
        args.timeout = parseInt(argv[++i], 10);
        break;
      case '--retries':
        args.retries = parseInt(argv[++i], 10);
        break;
      case '--only':
        args.only = argv[++i];
        break;
      case '--prompt-id':
        args.promptId = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--approval-mode':
        args.approvalMode = argv[++i];
        break;
      case '--cli-path':
        args.cliPath = resolve(argv[++i]);
        break;
      case '--no-reset':
        args.noReset = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
    }
  }
  return args;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadPrompts() {
  if (!existsSync(PROMPTS_FILE)) {
    throw new Error(`Prompts file not found: ${PROMPTS_FILE}`);
  }
  const data = JSON.parse(readFileSync(PROMPTS_FILE, 'utf-8'));
  return data.prompts || [];
}

function clearResults(projectDir) {
  const resultFile = join(projectDir, 'benchmark.result.json');
  writeFileSync(resultFile, '[]', 'utf-8');
}

/**
 * Read the benchmark.result.json entries from a project directory.
 */
function readBenchmarkResults(projectDir) {
  const resultFile = join(projectDir, 'benchmark.result.json');
  try {
    const data = JSON.parse(readFileSync(resultFile, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Aggregates BenchmarkLogger entries into per-prompt metrics.
 * Each prompt may produce multiple API calls (turns), so we aggregate them.
 */
function aggregateBenchmarkEntries(entries) {
  if (!entries || entries.length === 0) {
    return null;
  }

  const totalTokensIn = entries.reduce((s, e) => s + (e.tokens?.input || 0), 0);
  const totalTokensOut = entries.reduce(
    (s, e) => s + (e.tokens?.output || 0),
    0,
  );
  const totalTokens = entries.reduce((s, e) => s + (e.tokens?.total || 0), 0);
  const cachedTokens = entries.reduce((s, e) => s + (e.tokens?.cached || 0), 0);

  // Unique context files across all turns
  const contextFileSet = new Set();
  for (const e of entries) {
    if (e.contextFiles) {
      for (const f of e.contextFiles) contextFileSet.add(f);
    }
  }

  // Memory files (from any turn)
  const memoryFileSet = new Set();
  const memoryFileDetails = [];
  for (const e of entries) {
    if (e.memoryFiles) {
      for (const mf of e.memoryFiles) {
        if (!memoryFileSet.has(mf.path)) {
          memoryFileSet.add(mf.path);
          memoryFileDetails.push(mf);
        }
      }
    }
  }

  // Models used
  const modelSet = new Set();
  for (const e of entries) {
    if (e.model) modelSet.add(e.model);
  }

  // Context breakdown — take the last turn's values (most complete)
  const lastEntry = entries[entries.length - 1];
  const contextBreakdown = lastEntry.contextBreakdown || {};

  // Compression
  const compressionTriggered = entries.some((e) => e.compressionTriggered);

  // Total API duration (sum of all turn durations)
  const apiDurationMs = entries.reduce((s, e) => s + (e.durationMs || 0), 0);

  // Request payload sizes
  const totalPayloadSize = entries.reduce(
    (s, e) => s + (e.requestPayloadSize || 0),
    0,
  );

  // Tool count (from first entry, since it's constant per session)
  const toolCount = entries[0]?.toolCount || 0;

  return {
    turns: entries.length,
    tokens: {
      input: totalTokensIn,
      output: totalTokensOut,
      total: totalTokens,
      cached: cachedTokens,
    },
    contextFiles: [...contextFileSet],
    memoryFiles: memoryFileDetails,
    models: [...modelSet],
    contextBreakdown: {
      systemPromptChars: contextBreakdown.systemPromptChars || 0,
      fileTreeChars: contextBreakdown.fileTreeChars || 0,
      memoryChars: contextBreakdown.memoryChars || 0,
      environmentContextChars: contextBreakdown.environmentContextChars || 0,
      chatHistoryChars: contextBreakdown.chatHistoryChars || 0,
      chatHistoryTurns: contextBreakdown.chatHistoryTurns || 0,
      ideContextChars: contextBreakdown.ideContextChars || 0,
    },
    compressionTriggered,
    apiDurationMs,
    totalPayloadSize,
    toolCount,
    // Include raw entries for full visibility
    rawEntries: entries,
  };
}

/**
 * Reset a project's src/ directory from the _template.
 * This ensures each run starts from a clean, identical codebase.
 */
function resetProjectFromTemplate(projectDir) {
  const targetSrc = join(projectDir, 'src');
  const templateSrc = join(TEMPLATE_DIR, 'src');

  if (!existsSync(templateSrc)) {
    throw new Error(`Template src/ not found: ${templateSrc}`);
  }

  // Remove existing src/ and copy from template
  if (existsSync(targetSrc)) {
    rmSync(targetSrc, { recursive: true, force: true });
  }
  cpSync(templateSrc, targetSrc, { recursive: true });
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  if (ms < 60_000) return `${seconds}s`;
  const minutes = Math.floor(ms / 60_000);
  const remainingSeconds = ((ms % 60_000) / 1000).toFixed(0);
  return `${minutes}m ${remainingSeconds}s`;
}

function timestamp() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format elapsed time as MM:SS
 */
function elapsed(startMs) {
  const ms = Date.now() - startMs;
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ─── Live Status Tracker ────────────────────────────────────────────────────

/**
 * Parses CLI stderr output and extracts meaningful status updates.
 * Returns a short human-readable status line.
 */
function extractStatus(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 3) return null;

  // Tool-related patterns
  if (trimmed.includes('read_file') || trimmed.includes('ReadFile')) {
    return '📖 Reading file...';
  }
  if (
    trimmed.includes('write_file') ||
    trimmed.includes('WriteFile') ||
    trimmed.includes('write_to_file') ||
    trimmed.includes('create_file')
  ) {
    return '✏️  Writing file...';
  }
  if (
    trimmed.includes('edit_file') ||
    trimmed.includes('EditFile') ||
    trimmed.includes('replace_file') ||
    trimmed.includes('ReplaceFile')
  ) {
    return '🔧 Editing file...';
  }
  if (
    trimmed.includes('list_dir') ||
    trimmed.includes('ListDir') ||
    trimmed.includes('list_files') ||
    trimmed.includes('ListFiles')
  ) {
    return '📂 Listing directory...';
  }
  if (
    trimmed.includes('search') ||
    trimmed.includes('Search') ||
    trimmed.includes('grep')
  ) {
    return '🔍 Searching...';
  }
  if (
    trimmed.includes('run_command') ||
    trimmed.includes('RunCommand') ||
    trimmed.includes('shell') ||
    trimmed.includes('Shell')
  ) {
    return '💻 Running command...';
  }

  // Model/API patterns
  if (trimmed.includes('Thinking') || trimmed.includes('thinking')) {
    return '🧠 Thinking...';
  }
  if (trimmed.includes('Generating') || trimmed.includes('generating')) {
    return '⚡ Generating...';
  }
  if (
    trimmed.includes('Routing') ||
    trimmed.includes('routing') ||
    trimmed.includes('model:')
  ) {
    return '🔀 Routing model...';
  }

  // Error/warning patterns
  if (trimmed.includes('ERROR') || trimmed.includes('Error')) {
    return `⚠️  ${trimmed.substring(0, 80)}`;
  }

  return null;
}

// ─── Run a single prompt ────────────────────────────────────────────────────

/**
 * Runs a single prompt through the Gemini CLI with live status output.
 */
function runPrompt(project, prompt, options) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const cliArgs = [
      options.cliPath,
      '--prompt',
      prompt.prompt,
      '--approval-mode',
      options.approvalMode,
    ];

    if (project.smartMode) {
      cliArgs.push('--smart');
    }

    const child = spawn('node', cliArgs, {
      cwd: project.dir,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        NODE_OPTIONS: '--max-old-space-size=4096',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    });

    let stdout = '';
    let stderr = '';
    let lastStatus = '';
    let statusCount = 0;

    // Status update interval — show elapsed time every 15 seconds
    const statusTimer = setInterval(() => {
      const el = elapsed(startTime);
      const statusLine = lastStatus || '⏳ Working...';
      process.stdout.write(
        `\r         ⏱️  [${el}] ${statusLine}${''.padEnd(30)}`,
      );
    }, 15_000);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      if (stdout.length > 10_000_000) {
        stdout = stdout.slice(-5_000_000);
      }

      if (options.verbose) {
        process.stdout.write(text);
      } else {
        // Parse for status updates
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            statusCount++;
            // Show first few lines and then periodic updates
            if (statusCount <= 3 || statusCount % 10 === 0) {
              const truncated = line.trim().substring(0, 100);
              if (truncated.length > 5) {
                lastStatus = `💬 ${truncated}`;
              }
            }
          }
        }
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      if (stderr.length > 5_000_000) {
        stderr = stderr.slice(-2_500_000);
      }

      if (options.verbose) {
        process.stderr.write(text);
      } else {
        // Parse for meaningful status
        const lines = text.split('\n');
        for (const line of lines) {
          const status = extractStatus(line);
          if (status) {
            lastStatus = status;
            const el = elapsed(startTime);
            process.stdout.write(
              `\r         ⏱️  [${el}] ${status}${''.padEnd(30)}`,
            );
          }
        }
      }
    });

    // Timeout handler
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 5_000);
    }, options.timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      clearInterval(statusTimer);
      // Clear the status line
      process.stdout.write('\r' + ''.padEnd(100) + '\r');

      const durationMs = Date.now() - startTime;
      const timedOut = durationMs >= options.timeout - 1000;

      resolve({
        success: code === 0,
        durationMs,
        exitCode: code,
        timedOut,
        error:
          code !== 0
            ? timedOut
              ? `Timed out after ${formatDuration(options.timeout)}`
              : `Exit code ${code}: ${stderr.slice(-2000)}`
            : undefined,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      clearInterval(statusTimer);
      process.stdout.write('\r' + ''.padEnd(100) + '\r');

      resolve({
        success: false,
        durationMs: Date.now() - startTime,
        exitCode: null,
        timedOut: false,
        error: `Spawn error: ${err.message}`,
      });
    });
  });
}

// ─── Main Runner ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  console.log('');
  console.log(
    '╔══════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║              🚀 Gemini CLI Benchmark Runner                 ║',
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════╝',
  );
  console.log('');
  console.log(`  Timeout per prompt : ${formatDuration(args.timeout)}`);
  console.log(`  Retries per prompt : ${args.retries}`);
  console.log(`  Approval mode      : ${args.approvalMode}`);
  console.log(`  CLI path           : ${args.cliPath}`);
  console.log(`  Auto-reset         : ${!args.noReset}`);
  console.log(`  Verbose output     : ${args.verbose}`);
  console.log(`  Dry run            : ${args.dryRun}`);
  if (args.only) console.log(`  Only project       : ${args.only}`);
  if (args.promptId) console.log(`  Only prompt ID     : ${args.promptId}`);
  console.log('');

  // Validate CLI path
  if (!existsSync(args.cliPath)) {
    console.error(`  ❌ CLI start script not found: ${args.cliPath}`);
    console.error(`     Use --cli-path to specify the correct path.`);
    process.exit(1);
  }

  // Validate template exists
  if (!args.noReset && !existsSync(join(TEMPLATE_DIR, 'src'))) {
    console.error(`  ❌ Template not found: ${TEMPLATE_DIR}/src`);
    console.error(`     Create the template or use --no-reset to skip.`);
    process.exit(1);
  }

  // Load prompts from single source
  let prompts;
  try {
    prompts = loadPrompts();
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    process.exit(1);
  }

  // Filter by prompt ID if specified
  if (args.promptId) {
    prompts = prompts.filter((p) => p.id === args.promptId);
    if (prompts.length === 0) {
      console.error(`  ❌ No prompt found with ID "${args.promptId}"`);
      process.exit(1);
    }
  }

  console.log(`  📋 Loaded ${prompts.length} prompts from prompts.json`);

  // Filter projects based on --only flag
  let projects = PROJECTS;
  if (args.only === 'baseline') {
    projects = projects.filter((p) => !p.smartMode);
  } else if (args.only === 'smart') {
    projects = projects.filter((p) => p.smartMode);
  }

  const allResults = [];

  for (const project of projects) {
    console.log('');
    console.log(
      `┌──────────────────────────────────────────────────────────────┐`,
    );
    console.log(`│  📁 ${project.label.padEnd(55)}│`);
    console.log(`│     ${project.dir.padEnd(55).substring(0, 55)}│`);
    console.log(
      `└──────────────────────────────────────────────────────────────┘`,
    );

    // Validate project directory
    if (!existsSync(project.dir)) {
      console.error(`  ❌ Project directory not found: ${project.dir}`);
      continue;
    }

    // Reset project from template
    if (!args.noReset && !args.dryRun) {
      try {
        resetProjectFromTemplate(project.dir);
        console.log(`  🔄 Reset src/ from template (clean state)`);
      } catch (err) {
        console.error(`  ❌ Failed to reset: ${err.message}`);
        continue;
      }
    }

    console.log(`  Running ${prompts.length} prompts.\n`);

    // Clear previous results
    if (!args.dryRun) {
      clearResults(project.dir);
      console.log(`  🗑️  Cleared previous benchmark.result.json\n`);
    }

    const projectResults = [];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      const index = `[${i + 1}/${prompts.length}]`;

      console.log(`  ${index} 🏷️  ${prompt.category} (${prompt.id})`);
      console.log(`         "${prompt.prompt.substring(0, 80)}..."`);

      if (args.dryRun) {
        console.log(
          `         ⏭️  [dry-run] Would run with smart=${project.smartMode}`,
        );
        console.log('');
        continue;
      }

      const startLabel = timestamp();
      console.log(`         ⏱️  Started at ${startLabel}`);

      // Capture current benchmark entry count to detect new entries
      const entriesBefore = readBenchmarkResults(project.dir).length;

      let result;
      let attempt = 0;
      const maxAttempts = 1 + args.retries;

      while (attempt < maxAttempts) {
        attempt++;
        if (attempt > 1) {
          console.log(
            `         🔄 Retry ${attempt - 1}/${args.retries} — waiting 10s...`,
          );
          await sleep(10_000);

          // Reset src before retry too
          if (!args.noReset) {
            try {
              resetProjectFromTemplate(project.dir);
              console.log(`         🔄 Reset src/ for retry`);
            } catch (err) {
              console.error(`         ⚠️  Could not reset: ${err.message}`);
            }
          }
        }

        result = await runPrompt(project, prompt, {
          timeout: args.timeout,
          approvalMode: args.approvalMode,
          cliPath: args.cliPath,
          verbose: args.verbose,
        });

        if (result.success) {
          break;
        }

        // On failure, show it but retry if attempts remain
        if (attempt < maxAttempts) {
          console.log(
            `         ❌ Attempt ${attempt} failed in ${formatDuration(result.durationMs)}` +
              (result.exitCode !== null && result.exitCode !== 0
                ? ` (exit: ${result.exitCode})`
                : ''),
          );
          if (result.error) {
            console.log(`         ⚠️  ${result.error.substring(0, 300)}`);
          }
        }
      }

      const status = result.success ? '✅' : result.timedOut ? '⏰' : '❌';

      // Read new benchmark entries logged during this prompt
      const allEntries = readBenchmarkResults(project.dir);
      const newEntries = allEntries.slice(entriesBefore);
      const metrics = aggregateBenchmarkEntries(newEntries);

      console.log(
        `         ${status} ${result.success ? 'Completed' : 'Failed'} in ${formatDuration(result.durationMs)}` +
          (result.exitCode !== null && result.exitCode !== 0
            ? ` (exit: ${result.exitCode})`
            : '') +
          (attempt > 1 ? ` (attempt ${attempt}/${maxAttempts})` : ''),
      );

      // Show rich metrics summary
      if (metrics) {
        console.log(
          `         📊 ${metrics.turns} turns | ` +
            `Tokens: ${metrics.tokens.input}→${metrics.tokens.output} (${metrics.tokens.total} total` +
            (metrics.tokens.cached ? `, ${metrics.tokens.cached} cached` : '') +
            `) | ` +
            `${metrics.contextFiles.length} ctx files | ` +
            `Models: ${metrics.models.join(', ')}`,
        );
        const cb = metrics.contextBreakdown;
        console.log(
          `         📐 Context: tree=${cb.fileTreeChars}ch, memory=${cb.memoryChars}ch, ` +
            `env=${cb.environmentContextChars}ch, history=${cb.chatHistoryChars}ch (${cb.chatHistoryTurns} turns)`,
        );
      }

      if (result.error) {
        console.log(`         ⚠️  ${result.error.substring(0, 300)}`);
      }
      console.log('');

      projectResults.push({
        promptId: prompt.id,
        category: prompt.category,
        smartMode: project.smartMode,
        attempts: attempt,
        metrics,
        ...result,
      });
    }

    allResults.push({
      project: project.name,
      label: project.label,
      smartMode: project.smartMode,
      results: projectResults,
    });
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  if (!args.dryRun && allResults.length > 0) {
    console.log('');
    console.log(
      '╔══════════════════════════════════════════════════════════════╗',
    );
    console.log(
      '║                    📊 Benchmark Summary                     ║',
    );
    console.log(
      '╚══════════════════════════════════════════════════════════════╝',
    );
    console.log('');

    for (const projectResult of allResults) {
      const total = projectResult.results.length;
      const passed = projectResult.results.filter((r) => r.success).length;
      const failed = total - passed;
      const totalDuration = projectResult.results.reduce(
        (sum, r) => sum + r.durationMs,
        0,
      );

      console.log(`  📁 ${projectResult.label}`);
      console.log(
        `     ✅ Passed: ${passed}/${total}  ❌ Failed: ${failed}/${total}`,
      );
      console.log(`     ⏱️  Total duration: ${formatDuration(totalDuration)}`);
      console.log('');

      // Per-prompt summary table
      console.log(
        '     ┌─────────────────────────────┬────────┬──────────┬───────┬────────────┬────────────┬────────────┐',
      );
      console.log(
        '     │ Prompt ID                   │ Status │ Duration │ Turns │ Tokens In  │ Tokens Out │ Ctx Files  │',
      );
      console.log(
        '     ├─────────────────────────────┼────────┼──────────┼───────┼────────────┼────────────┼────────────┤',
      );

      for (const r of projectResult.results) {
        const id = r.promptId.padEnd(27).substring(0, 27);
        const rstatus = r.success ? '  ✅ ' : r.timedOut ? '  ⏰ ' : '  ❌ ';
        const dur = formatDuration(r.durationMs).padStart(8);
        const turns = String(r.metrics?.turns || '-').padStart(5);
        const tokIn = String(r.metrics?.tokens?.input || '-').padStart(10);
        const tokOut = String(r.metrics?.tokens?.output || '-').padStart(10);
        const ctxFiles = String(
          r.metrics?.contextFiles?.length || '-',
        ).padStart(10);
        console.log(
          `     │ ${id} │${rstatus} │${dur} │${turns}  │${tokIn} │${tokOut} │${ctxFiles} │`,
        );
      }

      console.log(
        '     └─────────────────────────────┴────────┴──────────┴───────┴────────────┴────────────┴────────────┘',
      );

      // Aggregate token totals for the project
      const totalTokensIn = projectResult.results.reduce(
        (s, r) => s + (r.metrics?.tokens?.input || 0),
        0,
      );
      const totalTokensOut = projectResult.results.reduce(
        (s, r) => s + (r.metrics?.tokens?.output || 0),
        0,
      );
      const totalTokensCached = projectResult.results.reduce(
        (s, r) => s + (r.metrics?.tokens?.cached || 0),
        0,
      );
      const totalTurns = projectResult.results.reduce(
        (s, r) => s + (r.metrics?.turns || 0),
        0,
      );
      console.log(
        `     📊 Totals: ${totalTurns} turns | Tokens: ${totalTokensIn} in, ${totalTokensOut} out` +
          (totalTokensCached ? `, ${totalTokensCached} cached` : ''),
      );
      console.log('');
    }

    // Read back benchmark.result.json stats
    console.log('  📄 Generated report files:');
    for (const project of projects) {
      const resultFile = join(project.dir, 'benchmark.result.json');
      if (existsSync(resultFile)) {
        try {
          const data = JSON.parse(readFileSync(resultFile, 'utf-8'));
          const entries = Array.isArray(data) ? data.length : 0;
          console.log(`     • ${resultFile}`);
          console.log(`       (${entries} entries logged by BenchmarkLogger)`);
        } catch {
          console.log(`     • ${resultFile} (could not parse)`);
        }
      } else {
        console.log(`     • ${resultFile} (not created — check for errors)`);
      }
    }

    // Write run metadata
    mkdirSync(RESULTS_DIR, { recursive: true });
    const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const metaFile = join(RESULTS_DIR, `run-${runTimestamp}.json`);
    const meta = {
      timestamp: timestamp(),
      config: {
        timeout: args.timeout,
        retries: args.retries,
        approvalMode: args.approvalMode,
        cliPath: args.cliPath,
        only: args.only,
        promptId: args.promptId,
      },
      projects: allResults.map((pr) => {
        const totalTokensIn = pr.results.reduce(
          (s, r) => s + (r.metrics?.tokens?.input || 0),
          0,
        );
        const totalTokensOut = pr.results.reduce(
          (s, r) => s + (r.metrics?.tokens?.output || 0),
          0,
        );
        const totalTokens = pr.results.reduce(
          (s, r) => s + (r.metrics?.tokens?.total || 0),
          0,
        );
        const totalTurns = pr.results.reduce(
          (s, r) => s + (r.metrics?.turns || 0),
          0,
        );
        return {
          name: pr.project,
          label: pr.label,
          smartMode: pr.smartMode,
          total: pr.results.length,
          passed: pr.results.filter((r) => r.success).length,
          failed: pr.results.filter((r) => !r.success).length,
          totalDurationMs: pr.results.reduce((s, r) => s + r.durationMs, 0),
          tokenSummary: {
            totalInput: totalTokensIn,
            totalOutput: totalTokensOut,
            totalTokens,
            totalTurns,
          },
          prompts: pr.results.map((r) => ({
            id: r.promptId,
            category: r.category,
            success: r.success,
            durationMs: r.durationMs,
            exitCode: r.exitCode,
            timedOut: r.timedOut,
            attempts: r.attempts,
            error: r.error,
            metrics: r.metrics
              ? {
                  turns: r.metrics.turns,
                  tokens: r.metrics.tokens,
                  contextFiles: r.metrics.contextFiles,
                  memoryFiles: r.metrics.memoryFiles,
                  models: r.metrics.models,
                  contextBreakdown: r.metrics.contextBreakdown,
                  compressionTriggered: r.metrics.compressionTriggered,
                  apiDurationMs: r.metrics.apiDurationMs,
                  totalPayloadSize: r.metrics.totalPayloadSize,
                  toolCount: r.metrics.toolCount,
                }
              : null,
          })),
        };
      }),
    };

    writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8');
    console.log(`\n  📝 Run metadata saved to: ${metaFile}`);
  }

  console.log('\n  ✨ Benchmark run complete.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
