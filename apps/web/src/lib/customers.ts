import { apiRequest } from "./api";

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerInput = {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
};

export type UpdateCustomerInput = {
  name?: string;
  phone?: string;
  address?: string;
  notes?: string;
  isActive?: boolean;
};

export async function getCustomers(token: string, search?: string) {
  const query = search?.trim()
    ? `?search=${encodeURIComponent(search.trim())}`
    : "";

  return apiRequest<{ ok: true; customers: Customer[] }>(`/customers${query}`, {
    method: "GET",
    token,
  });
}

export async function getCustomer(token: string, id: string) {
  return apiRequest<{ ok: true; customer: Customer }>(`/customers/${id}`, {
    method: "GET",
    token,
  });
}

export async function createCustomer(
  token: string,
  input: CreateCustomerInput,
) {
  return apiRequest<{ ok: true; customer: Customer }>("/customers", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function updateCustomer(
  token: string,
  id: string,
  input: UpdateCustomerInput,
) {
  return apiRequest<{ ok: true; customer: Customer }>(`/customers/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}

export async function activateCustomer(token: string, id: string) {
  return updateCustomer(token, id, {
    isActive: true,
  });
}

export async function deactivateCustomer(token: string, id: string) {
  return updateCustomer(token, id, {
    isActive: false,
  });
}
