/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateProductUseCase } from '../../domain/ports/in/create-product.use-case';
import { Product } from '../../domain/model/product';
import { ProductRepository } from '../../domain/ports/out/product.repository';
import { ProductId } from '../../domain/model/product-id';

@Injectable()
export class CreateProductService implements CreateProductUseCase {
  constructor(private productRepository: ProductRepository) {}

  execute(name: string, price: number, description: string): Observable<Product> {
    const id = new ProductId(crypto.randomUUID());
    const product = new Product(id, name, price, description);
    return this.productRepository.save(product);
  }
}
