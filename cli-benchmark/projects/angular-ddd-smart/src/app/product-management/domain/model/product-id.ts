/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export class ProductId {
  constructor(public readonly value: string) {
    if (!value) {
      throw new Error('ProductId cannot be empty');
    }
  }
}
