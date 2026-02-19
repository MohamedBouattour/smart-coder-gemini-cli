/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { execSync } from 'node:child_process';
import process from 'node:process';

console.log(`Building package in ${process.cwd()}...`);
try {
  execSync('npx tsc -b', { stdio: 'inherit' });
} catch (error) {
  console.error('Package build failed:', error.message);
  process.exit(1);
}
