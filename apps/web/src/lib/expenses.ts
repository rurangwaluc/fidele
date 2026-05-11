import { apiRequest } from "./api";

export type ExpenseMethod = "cash" | "momo" | "bank" | "card" | "other";

export type ExpenseStatus = "waiting_owner_review" | "approved" | "rejected";

export type ExpenseCategory = {
  id: string;
  name: string;
  description: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

export type Expense = {
  id: string;
  expenseNumber: string;
  categoryId: string | null;
  categoryNameSnapshot: string;
  title: string;
  description: string | null;
  amountRwf: number;
  method: ExpenseMethod;
  status: ExpenseStatus;
  isActive: number;
  paidAt: string | null;
  createdById: string | null;
  createdByName: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  rejectedById: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  ledgerEntryId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateExpenseInput = {
  categoryName: string;
  title: string;
  description?: string;
  amountRwf: number;
  method: ExpenseMethod;
  paidAt?: string;
};

export type RejectExpenseInput = {
  reason?: string;
};

export async function getExpenseCategories(token: string) {
  return apiRequest<{ ok: true; categories: ExpenseCategory[] }>(
    "/expenses/categories",
    {
      method: "GET",
      token,
    },
  );
}

export async function getExpenses(
  token: string,
  input?: {
    search?: string;
    status?: string;
  },
) {
  const params = new URLSearchParams();

  if (input?.search) params.set("search", input.search);
  if (input?.status) params.set("status", input.status);

  const query = params.toString() ? `?${params.toString()}` : "";

  return apiRequest<{ ok: true; expenses: Expense[] }>(`/expenses${query}`, {
    method: "GET",
    token,
  });
}

export async function createExpense(token: string, input: CreateExpenseInput) {
  return apiRequest<{
    ok: true;
    expense: Expense;
    ledgerEntry: unknown | null;
  }>("/expenses", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function approveExpense(token: string, expenseId: string) {
  return apiRequest<{ ok: true; expense: Expense; ledgerEntry: unknown }>(
    `/expenses/${expenseId}/approve`,
    {
      method: "PATCH",
      token,
    },
  );
}

export async function rejectExpense(
  token: string,
  expenseId: string,
  input: RejectExpenseInput,
) {
  return apiRequest<{ ok: true; expense: Expense }>(
    `/expenses/${expenseId}/reject`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify(input),
    },
  );
}

export async function deactivateExpense(token: string, expenseId: string) {
  return apiRequest<{ ok: true; expense: Expense }>(
    `/expenses/${expenseId}/deactivate`,
    {
      method: "PATCH",
      token,
    },
  );
}
