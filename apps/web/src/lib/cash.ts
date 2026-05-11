import { apiRequest } from "./api";

export type MoneyDirection = "money_in" | "money_out" | "neutral";
export type MoneyMethod = "cash" | "momo" | "bank" | "card" | "other";

export type CashSession = {
  id: string;
  businessDate: string;
  status: "open" | "closed";
  openingFloatRwf: number;
  expectedCashRwf: number;
  countedCashRwf: number | null;
  differenceRwf: number;
  openedById: string | null;
  closedById: string | null;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CashTotals = {
  moneyInRwf: number;
  moneyOutRwf: number;

  cashInRwf: number;
  cashOutRwf: number;

  momoInRwf: number;
  momoOutRwf: number;

  bankInRwf: number;
  bankOutRwf: number;

  cardInRwf: number;
  cardOutRwf: number;

  otherInRwf: number;
  otherOutRwf: number;

  expectedCashRwf: number;
};

export type MoneyLedgerEntry = {
  id: string;
  businessDate: string;
  cashSessionId: string | null;
  direction: MoneyDirection;
  amountRwf: number;
  method: MoneyMethod;
  category: string;
  sourceType: string;
  sourceId: string | null;
  sourceItemId: string | null;
  description: string | null;
  actorUserId: string | null;
  actorName: string | null;
  happenedAt: string;
  createdAt: string;
};

export type CashTodayResponse = {
  ok: true;
  businessDate: string;
  session: CashSession | null;
  totals: CashTotals;
  ledger: MoneyLedgerEntry[];
};

export type OpenCashInput = {
  businessDate?: string;
  openingFloatRwf: number;
  notes?: string;
};

export type ReopenCashInput = {
  businessDate?: string;
  notes?: string;
};

export type CloseCashInput = {
  businessDate?: string;
  countedCashRwf: number;
  notes?: string;
};

export type ManualMoneyMovementInput = {
  businessDate?: string;
  direction: "money_in" | "money_out";
  amountRwf: number;
  method: MoneyMethod;
  category: string;
  description?: string;
};

export async function getCashToday(token: string, date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";

  return apiRequest<CashTodayResponse>(`/cash/today${query}`, {
    method: "GET",
    token,
  });
}

export async function getCashLedger(token: string, date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";

  return apiRequest<CashTodayResponse>(`/cash/ledger${query}`, {
    method: "GET",
    token,
  });
}

export async function openCashSession(token: string, input: OpenCashInput) {
  return apiRequest<{ ok: true; session: CashSession }>("/cash/open", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function reopenCashSession(token: string, input: ReopenCashInput) {
  return apiRequest<{
    ok: true;
    session: CashSession;
    reopenLog: MoneyLedgerEntry;
  }>("/cash/reopen", {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}

export async function closeCashSession(token: string, input: CloseCashInput) {
  return apiRequest<{
    ok: true;
    session: CashSession;
    differenceLog: MoneyLedgerEntry;
    totals: CashTotals;
  }>("/cash/close", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function createManualMoneyMovement(
  token: string,
  input: ManualMoneyMovementInput,
) {
  return apiRequest<{ ok: true; movement: MoneyLedgerEntry }>(
    "/cash/ledger/manual",
    {
      method: "POST",
      token,
      body: JSON.stringify(input),
    },
  );
}
