/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ProductId } from './product-id';

export class Product {
  constructor(
    public readonly id: ProductId,
    public name: string,
    public price: number,
    public description: string,
  ) {
    if (price < 0) {
      throw new Error('Price cannot be negative');
    }
  }

  updatePrice(newPrice: number): void {
    if (newPrice < 0) {
      throw new Error('Price cannot be negative');
    }
    this.price = newPrice;
  }
}
