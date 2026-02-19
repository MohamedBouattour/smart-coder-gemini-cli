/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Breakdown of context components and their estimated sizes.
 */
export interface ContextBreakdown {
  /** System prompt character count */
  systemPromptChars: number;
  /** File tree string character count */
  fileTreeChars: number;
  /** Memory files (GEMINI.md) character count */
  memoryChars: number;
  /** Environment context (session_context block) character count */
  environmentContextChars: number;
  /** Chat history character count (all turns) */
  chatHistoryChars: number;
  /** Number of turns in chat history */
  chatHistoryTurns: number;
  /** IDE context character count (if connected) */
  ideContextChars: number;
}

/**
 * Details about a single memory (GEMINI.md) file loaded.
 */
export interface MemoryFileDetail {
  /** Absolute path to the file */
  path: string;
  /** Which tier: 'global', 'extension', or 'project' */
  tier: 'global' | 'extension' | 'project';
  /** Character count of the file content */
  chars: number;
}

/**
 * A single benchmark log entry with full context visibility.
 */
export interface BenchmarkLog {
  /** ISO timestamp */
  timestamp: string;
  /** Unique prompt ID for this request */
  promptId: string;
  /** List of context file paths used */
  contextFiles: string[];
  /** Detailed breakdown of memory files loaded */
  memoryFiles: MemoryFileDetail[];
  /** Token usage from the API response */
  tokens: {
    input?: number;
    output?: number;
    total?: number;
    /** Cached/grounded tokens if reported by API */
    cached?: number;
  };
  /** Breakdown of context component sizes */
  contextBreakdown: ContextBreakdown;
  /** Model used for this request */
  model: string;
  /** Request duration in milliseconds */
  durationMs: number;
  /** Total request payload size in characters */
  requestPayloadSize: number;
  /** Number of tool declarations sent */
  toolCount: number;
  /** Status of the request */
  status: 'success' | 'cancelled' | 'error';
  /** Error message if status is 'error' */
  errorMessage?: string;
  /** Whether compression was triggered before this request */
  compressionTriggered: boolean;
  /** Whether IDE companion was connected */
  ideConnected: boolean;
  /** Operating system platform */
  platform: string;
}

/**
 * Contextual data collected during the context gathering phase,
 * to be passed to the BenchmarkLogger when logging a request.
 */
export interface ContextGatheringData {
  systemPromptChars: number;
  fileTreeChars: number;
  memoryChars: number;
  environmentContextChars: number;
  chatHistoryChars: number;
  chatHistoryTurns: number;
  ideContextChars: number;
  memoryFiles: MemoryFileDetail[];
  toolCount: number;
  compressionTriggered: boolean;
  ideConnected: boolean;
}

/**
 * Logger that writes benchmark results to a JSON file.
 * Each entry provides full visibility into the context gathering process.
 */
export class BenchmarkLogger {
  private logFilePath: string;

  constructor(rootPath: string) {
    this.logFilePath = path.join(rootPath, 'benchmark.result.json');
  }

  async log(entry: BenchmarkLog): Promise<void> {
    let logs: BenchmarkLog[] = [];
    try {
      const fileContent = await fs.readFile(this.logFilePath, 'utf-8');
      const parsed: unknown = JSON.parse(fileContent);
      if (Array.isArray(parsed)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- External JSON file schema
        logs = parsed as BenchmarkLog[];
      }
    } catch {
      // File doesn't exist or is invalid JSON, start fresh
      logs = [];
    }

    logs.push(entry);

    await fs.writeFile(
      this.logFilePath,
      JSON.stringify(logs, null, 2),
      'utf-8',
    );
  }
}
