import { apiRequest } from "./api";

export type BankAccount = {
  bankName: string;
  accountName?: string | null;
  accountNumber: string;
  notes?: string | null;
};

export type ShopSettings = {
  id: string;

  business: {
    businessName: string | null;
    shopName: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    tin: string | null;
    momoCode: string | null;
    logoUrl: string | null;
    bankAccounts: BankAccount[];
  };

  report: {
    reportBusinessName: string | null;
    reportFooterText: string | null;
  };

  system: {
    currency: string;
  };

  cashRules: {
    requireOpenCashForSales: boolean;
    requireOpenCashForDebtPayments: boolean;
    requireOpenCashForPaidExpenses: boolean;
    allowOwnerCashReopen: boolean;
  };

  createdAt: string;
  updatedAt: string;
};

export type SettingsResponse = {
  ok: true;
  settings: ShopSettings;
};

export type SettingsMutationResponse = {
  ok: true;
  message: string;
  settings: ShopSettings;
};

export type UpdateBusinessSettingsInput = {
  businessName?: string;
  shopName?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  tin?: string;
  momoCode?: string;
  logoUrl?: string;
  bankAccounts?: BankAccount[];
};

export type UpdateReportSettingsInput = {
  reportBusinessName?: string;
  reportFooterText?: string;
};

export type UpdateCashRulesInput = {
  requireOpenCashForSales?: boolean;
  requireOpenCashForDebtPayments?: boolean;
  requireOpenCashForPaidExpenses?: boolean;
  allowOwnerCashReopen?: boolean;
};

export type UpdateSystemSettingsInput = {
  currency?: string;
};

export async function getSettings(token: string) {
  return apiRequest<SettingsResponse>("/settings/", {
    method: "GET",
    token,
  });
}

export async function updateBusinessSettings(
  token: string,
  input: UpdateBusinessSettingsInput,
) {
  return apiRequest<SettingsMutationResponse>("/settings/business", {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}

export async function updateReportSettings(
  token: string,
  input: UpdateReportSettingsInput,
) {
  return apiRequest<SettingsMutationResponse>("/settings/report", {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}

export async function updateCashRules(
  token: string,
  input: UpdateCashRulesInput,
) {
  return apiRequest<SettingsMutationResponse>("/settings/cash-rules", {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}

export async function updateSystemSettings(
  token: string,
  input: UpdateSystemSettingsInput,
) {
  return apiRequest<SettingsMutationResponse>("/settings/system", {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}
