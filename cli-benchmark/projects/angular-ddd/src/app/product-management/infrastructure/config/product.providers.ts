/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Provider } from '@angular/core';
import { CreateProductUseCase } from '../../domain/ports/in/create-product.use-case';
import { GetProductUseCase } from '../../domain/ports/in/get-product.use-case';
import { ProductRepository } from '../../domain/ports/out/product.repository';
import { CreateProductService } from '../../application/services/create-product.service';
import { GetProductService } from '../../application/services/get-product.service';
import { InMemoryProductRepository } from '../adapters/out/persistence/in-memory-product.repository';

export const PRODUCT_PROVIDERS: Provider[] = [
  { provide: CreateProductUseCase, useClass: CreateProductService },
  { provide: GetProductUseCase, useClass: GetProductService },
  { provide: ProductRepository, useClass: InMemoryProductRepository },
];
