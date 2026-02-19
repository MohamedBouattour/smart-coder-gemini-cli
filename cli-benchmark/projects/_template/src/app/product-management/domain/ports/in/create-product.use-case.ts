/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Product } from '../../model/product';
import { Observable } from 'rxjs';

export abstract class CreateProductUseCase {
  abstract execute(name: string, price: number, description: string): Observable<Product>;
}
