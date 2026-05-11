import { SalePaymentMethod } from "./sales";
import { apiRequest } from "./api";

export type CustomerDebtInstallment = {
  id: string;
  debtId: string;
  saleId: string | null;
  installmentNumber: number;
  expectedAmountRwf: number;
  amountPaidRwf: number;
  balanceRwf: number;
  dueAt: string;
  paidAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerDebt = {
  id: string;
  customerId: string;
  saleId: string | null;
  originalAmountRwf: number;
  amountPaidRwf: number;
  balanceRwf: number;
  status: string;
  expectedPaymentAt: string | null;
  notes: string | null;
  createdAt: string;
  customerName: string;
  customerPhone: string | null;
  saleNumber: string | null;
  createdByName: string | null;
  installments?: CustomerDebtInstallment[];
};

export type DebtPayment = {
  id: string;
  debtId: string;
  installmentId: string | null;
  saleId: string | null;
  amountRwf: number;
  method: SalePaymentMethod;
  note: string | null;
  receivedById: string | null;
  paidAt: string;
  createdAt: string;
};

export type RecordDebtPaymentInput = {
  amountRwf: number;
  method: SalePaymentMethod;
  note?: string;
  paidAt?: string;
  installmentId?: string;
};

export async function getDebts(token: string) {
  return apiRequest<{ ok: true; debts: CustomerDebt[] }>("/debts", {
    method: "GET",
    token,
  });
}

export async function getDebt(token: string, id: string) {
  return apiRequest<{
    ok: true;
    debt: CustomerDebt;
    installments: CustomerDebtInstallment[];
    payments: DebtPayment[];
  }>(`/debts/${id}`, {
    method: "GET",
    token,
  });
}

export async function recordDebtPayment(
  token: string,
  debtId: string,
  input: RecordDebtPaymentInput,
) {
  return apiRequest<{
    ok: true;
    payment: DebtPayment | null;
    payments: DebtPayment[];
    debt: CustomerDebt;
    sale: unknown | null;
    salePayment: unknown | null;
    installments: CustomerDebtInstallment[];
  }>(`/debts/${debtId}/payments`, {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}
