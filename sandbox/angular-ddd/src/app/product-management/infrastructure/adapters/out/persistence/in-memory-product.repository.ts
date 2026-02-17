/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Product } from '../../../domain/model/product';
import { ProductId } from '../../../domain/model/product-id';
import { ProductRepository } from '../../../domain/ports/out/product.repository';

@Injectable({
  providedIn: 'root',
})
export class InMemoryProductRepository implements ProductRepository {
  private products: Map<string, Product> = new Map();

  save(product: Product): Observable<Product> {
    this.products.set(product.id.value, product);
    return of(product);
  }

  findById(id: ProductId): Observable<Product | undefined> {
    return of(this.products.get(id.value));
  }

  findAll(): Observable<Product[]> {
    return of(Array.from(this.products.values()));
  }
}
