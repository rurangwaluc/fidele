import { apiRequest } from "./api";

export type Product = {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  model: string | null;
  description: string | null;
  buyingPriceRwf: number;
  sellingPriceRwf: number;
  minSellingPriceRwf: number;
  currentStock: number;
  lowStockAlert: number;
  warrantyText: string | null;
  reviewStatus: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  categoryName: string | null;
};

export type ProductCategory = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = {
  name: string;
  sku?: string;
  categoryName?: string;
  brand?: string;
  model?: string;
  description?: string;
  buyingPriceRwf: number;
  sellingPriceRwf: number;
  minSellingPriceRwf: number;
  lowStockAlert: number;
  warrantyText?: string;
};

export type ProductDetailsUpdateInput = {
  name?: string;
  categoryName?: string;
  brand?: string;
  model?: string;
  description?: string;
  lowStockAlert?: number;
  warrantyText?: string;
};

export type ProductPriceUpdateInput = {
  buyingPriceRwf?: number;
  sellingPriceRwf?: number;
  minSellingPriceRwf?: number;
  reason?: string;
};

export async function getProducts(token: string, search?: string) {
  const query = search?.trim()
    ? `?search=${encodeURIComponent(search.trim())}`
    : "";

  return apiRequest<{ ok: true; products: Product[] }>(`/products${query}`, {
    method: "GET",
    token,
  });
}

export async function getProductCategories(token: string) {
  return apiRequest<{ ok: true; categories: ProductCategory[] }>(
    "/products/categories",
    {
      method: "GET",
      token,
    },
  );
}

export async function createProduct(token: string, input: ProductInput) {
  return apiRequest<{ ok: true; product: Product }>("/products", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function updateProductDetails(
  token: string,
  id: string,
  input: ProductDetailsUpdateInput,
) {
  return apiRequest<{ ok: true; product: Product }>(`/products/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}

export async function updateProductPrices(
  token: string,
  id: string,
  input: ProductPriceUpdateInput,
) {
  return apiRequest<{ ok: true; product: Product }>(`/products/${id}/prices`, {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}

export async function deactivateProduct(token: string, id: string) {
  return apiRequest<{ ok: true; product: Product }>(
    `/products/${id}/deactivate`,
    {
      method: "PATCH",
      token,
    },
  );
}

export async function activateProduct(token: string, id: string) {
  return apiRequest<{ ok: true; product: Product }>(
    `/products/${id}/activate`,
    {
      method: "PATCH",
      token,
    },
  );
}
