/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import CommonModule
import { FormsModule } from '@angular/forms'; // Import FormsModule
import { CreateProductUseCase } from '../../../../domain/ports/in/create-product.use-case';
import { GetProductUseCase } from '../../../../domain/ports/in/get-product.use-case';
import { Product } from '../../../../domain/model/product';
import { Observable } from 'rxjs'; // Import Observable

@Component({
  selector: 'app-product',
  standalone: true,
  imports: [CommonModule, FormsModule], // Ensure imports are correct
  templateUrl: './product.component.html',
  styleUrls: ['./product.component.css'], // Corrected styleUrl -> styleUrls
})
export class ProductComponent implements OnInit {
  newProduct = { name: '', price: 0, description: '' };
  products$: Observable<Product[]>;

  constructor(
    private createProductUseCase: CreateProductUseCase,
    private getProductUseCase: GetProductUseCase,
  ) {}

  ngOnInit(): void {
    this.refreshList();
  }

  createProduct(): void {
    if (!this.newProduct.name || this.newProduct.price < 0) return;

    this.createProductUseCase
      .execute(this.newProduct.name, this.newProduct.price, this.newProduct.description)
      .subscribe(() => {
        this.newProduct = { name: '', price: 0, description: '' };
        this.refreshList();
      });
  }

  refreshList(): void {
    this.products$ = this.getProductUseCase.getAll();
  }
}
