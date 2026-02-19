/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Product } from '../../model/product';
import { ProductId } from '../../model/product-id';
import { Observable } from 'rxjs';

export abstract class GetProductUseCase {
  abstract execute(id: ProductId): Observable<Product | undefined>;
  abstract getAll(): Observable<Product[]>;
}
