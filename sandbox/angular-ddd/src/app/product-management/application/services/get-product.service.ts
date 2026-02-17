/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { GetProductUseCase } from '../../domain/ports/in/get-product.use-case';
import { Product } from '../../domain/model/product';
import { ProductId } from '../../domain/model/product-id';
import { ProductRepository } from '../../domain/ports/out/product.repository';

@Injectable()
export class GetProductService implements GetProductUseCase {
  constructor(private productRepository: ProductRepository) {}

  execute(id: ProductId): Observable<Product | undefined> {
    return this.productRepository.findById(id);
  }

  getAll(): Observable<Product[]> {
    return this.productRepository.findAll();
  }
}
