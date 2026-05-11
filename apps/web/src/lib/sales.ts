import { apiRequest } from "./api";

export type SaleCustomerType = "walk_in" | "existing" | "new";
export type SalePaymentMethod = "cash" | "momo" | "bank" | "card" | "other";
export type InstallmentFrequency = "daily" | "weekly" | "monthly";

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

export type CreateSaleInput = {
  customerType: SaleCustomerType;
  customerId?: string;
  walkInName?: string;
  newCustomer?: {
    name: string;
    phone?: string;
    address?: string;
    notes?: string;
  };
  items: {
    productId: string;
    quantity: number;
    unitPriceRwf: number;
  }[];
  payment: {
    amountPaidRwf: number;
    method: SalePaymentMethod;
    note?: string;
    expectedPaymentAt?: string;
    installmentPlan?: {
      numberOfInstallments: number;
      frequency: InstallmentFrequency;
      firstDueAt?: string;
    };
  };
  notes?: string;
};

export type SaleListItem = {
  id: string;
  saleNumber: string;
  customerType: string;
  walkInName: string | null;
  status: string;
  paymentStatus: string;
  totalAmountRwf: number;
  amountPaidRwf: number;
  balanceRwf: number;
  expectedPaymentAt: string | null;
  createdAt: string;
  customerName: string | null;
  soldByName: string | null;
};

export type SaleDetail = {
  id: string;
  saleNumber: string;
  customerType: string;
  walkInName: string | null;
  status: string;
  paymentStatus: string;
  subtotalRwf: number;
  totalAmountRwf: number;
  amountPaidRwf: number;
  balanceRwf: number;
  expectedPaymentAt: string | null;
  notes: string | null;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  soldByName: string | null;
};

export type SaleDetailItem = {
  id: string;
  saleId: string;
  productId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  quantity: number;
  unitPriceRwf: number;
  minSellingPriceRwf: number;
  lineTotalRwf: number;
  soldBelowMinimum: boolean;
  createdAt: string;
};

export type SalePayment = {
  id: string;
  saleId: string;
  amountRwf: number;
  method: SalePaymentMethod;
  note: string | null;
  receivedById: string | null;
  paidAt: string;
  createdAt: string;
};

export type SaleDebt = {
  id: string;
  customerId: string;
  saleId: string | null;
  originalAmountRwf: number;
  amountPaidRwf: number;
  balanceRwf: number;
  status: string;
  expectedPaymentAt: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatedSaleResponse = {
  ok: true;
  sale: {
    id: string;
    saleNumber: string;
    status: string;
    paymentStatus: string;
    totalAmountRwf: number;
    amountPaidRwf: number;
    balanceRwf: number;
    expectedPaymentAt: string | null;
  };
  items: SaleDetailItem[];
  payment: SalePayment | null;
  debt: SaleDebt | null;
  installments: CustomerDebtInstallment[];
};

export type SaleDetailResponse = {
  ok: true;
  sale: SaleDetail;
  items: SaleDetailItem[];
  payments: SalePayment[];
  debts: SaleDebt[];
  installments: CustomerDebtInstallment[];
};

export async function createSale(token: string, input: CreateSaleInput) {
  return apiRequest<CreatedSaleResponse>("/sales", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function getSales(token: string) {
  return apiRequest<{ ok: true; sales: SaleListItem[] }>("/sales", {
    method: "GET",
    token,
  });
}

export async function getSale(token: string, id: string) {
  return apiRequest<SaleDetailResponse>(`/sales/${id}`, {
    method: "GET",
    token,
  });
}
