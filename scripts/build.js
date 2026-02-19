/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { execSync } from 'node:child_process';
import process from 'node:process';

console.log('Building packages...');
try {
  execSync('npm run build:packages', { stdio: 'inherit' });
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
