// packages/types/src/reports.ts

export type BusinessReport = {
  period: {
    from: string;
    to: string;
  };

  performance: {
    revenueRwf: number;

    cogsRwf: number;

    grossProfitRwf: number;

    expensesRwf: number;

    netProfitRwf: number;

    profitMarginPercent: number;
  };

  cashFlow: {
    salesIncomeRwf: number;

    debtPaymentsRwf: number;

    otherIncomeRwf: number;

    totalMoneyInRwf: number;

    expensesRwf: number;

    supplierPaymentsRwf: number;

    withdrawalsRwf: number;

    totalMoneyOutRwf: number;

    netCashFlowRwf: number;
  };

  wallets: {
    cashRwf: number;

    momoRwf: number;

    bankRwf: number;

    cardRwf: number;

    otherRwf: number;
  };

  debts: {
    totalOutstandingRwf: number;

    overdueAmountRwf: number;

    overdueCount: number;

    collectedThisPeriodRwf: number;
  };

  inventory: {
    stockValueRwf: number;

    lowStockCount: number;

    zeroStockCount: number;
  };

  cashSession: {
    openingFloatRwf: number;

    expectedCashRwf: number;

    countedCashRwf: number;

    differenceRwf: number;

    status: "open" | "closed";
  } | null;

  health: {
    score: number;

    status: "excellent" | "good" | "warning" | "critical";
  };

  timeline: MoneyMovement[];
};

export type MoneyMovement = {
  id: string;

  date: string;

  direction: "money_in" | "money_out";

  amountRwf: number;

  method: "cash" | "momo" | "bank" | "card" | "other";

  category: string;

  description: string;

  actorName: string;
};
