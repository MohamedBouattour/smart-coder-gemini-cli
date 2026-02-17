/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface BenchmarkLog {
  timestamp: string;
  contextFiles: string[];
  tokens: {
    input?: number;
    output?: number;
    total?: number;
  };
  model: string;
  durationMs: number;
  requestPayloadSize: number;
  status: 'success' | 'cancelled' | 'error';
  errorMessage?: string;
}

export class BenchmarkLogger {
  private logFilePath: string;

  constructor(rootPath: string) {
    this.logFilePath = path.join(rootPath, 'benchmark.result.json');
  }

  async log(entry: BenchmarkLog): Promise<void> {
    let logs: BenchmarkLog[] = [];
    try {
      const fileContent = await fs.readFile(this.logFilePath, 'utf-8');
      logs = JSON.parse(fileContent);
    } catch {
      // File doesn't exist or is invalid, start fresh
      logs = [];
    }

    logs.push(entry);

    // Ensure uniqueness by timestamp and context to avoid duplicates if called multiple times rapidly
    // mostly relevant if multiple loggers try to write simultaneously, though unlikely in single-threaded node
    // More importantly, it appends.

    await fs.writeFile(
      this.logFilePath,
      JSON.stringify(logs, null, 2),
      'utf-8',
    );
  }
}
