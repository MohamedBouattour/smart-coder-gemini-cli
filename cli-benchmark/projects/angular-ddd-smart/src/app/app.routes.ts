/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Routes } from '@angular/router';
import { ProductComponent } from './product-management/infrastructure/adapters/in/web/product.component';

export const routes: Routes = [
  { path: '', component: ProductComponent },
  { path: '**', redirectTo: '' },
];
