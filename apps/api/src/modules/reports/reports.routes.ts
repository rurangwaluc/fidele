import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import {
  cashSessions,
  customerDebts,
  customers,
  db,
  debtPayments,
  expenses,
  moneyLedger,
  products,
  saleItems,
  salePayments,
  sales,
  users,
} from "@erc/db";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";

import type { FastifyInstance } from "fastify";
import PDFDocument from "pdfkit";
import { z } from "zod";

const reportQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

type AuthReportUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
};

type MoneyMethodTotals = {
  cash: number;
  momo: number;
  bank: number;
  card: number;
  other: number;
};

type DailySummaryReport = {
  businessName: string;
  reportTitle: string;
  businessDate: string;
  generatedAt: string;
  generatedBy: string;

  cashSession: {
    status: string;
    openingFloatRwf: number;
    expectedCashRwf: number;
    countedCashRwf: number | null;
    differenceRwf: number;
    openedAt: string | null;
    closedAt: string | null;
  } | null;

  summary: {
    totalSalesRwf: number;
    amountPaidOnSalesRwf: number;
    salesBalanceRwf: number;
    salesCount: number;

    estimatedCogsRwf: number;
    grossProfitRwf: number;
    netProfitRwf: number;
    profitMarginPercent: number;

    moneyInRwf: number;
    moneyOutRwf: number;
    netMoneyMovementRwf: number;

    approvedExpensesRwf: number;
    approvedExpensesCount: number;

    pendingExpensesRwf: number;
    pendingExpensesCount: number;

    newCustomerDebtRwf: number;
    debtPaymentsReceivedRwf: number;
    openCustomerDebtRwf: number;
    overdueDebtCount: number;

    stockValueRwf: number;
    lowStockCount: number;
    zeroStockCount: number;

    ledgerSalePaymentsRwf: number;
    salePaymentDifferenceRwf: number;
    dataCheckStatus: "clean" | "needs_review";
  };

  methodTotals: {
    moneyIn: MoneyMethodTotals;
    moneyOut: MoneyMethodTotals;
  };

  salesRows: {
    saleNumber: string;
    customerName: string;
    totalAmountRwf: number;
    amountPaidRwf: number;
    balanceRwf: number;
    paymentStatus: string;
    soldByName: string;
    createdAt: string;
  }[];

  moneyRows: {
    time: string;
    direction: string;
    amountRwf: number;
    method: string;
    category: string;
    description: string;
    actorName: string;
  }[];

  expenseRows: {
    expenseNumber: string;
    title: string;
    category: string;
    amountRwf: number;
    method: string;
    status: string;
    createdByName: string;
    paidAt: string | null;
  }[];

  debtRows: {
    customerName: string;
    customerPhone: string;
    saleNumber: string;
    balanceRwf: number;
    status: string;
    expectedPaymentAt: string | null;
  }[];

  lowStockRows: {
    name: string;
    sku: string;
    currentStock: number;
    lowStockAlert: number;
    sellingPriceRwf: number;
  }[];
};

const pdfColors = {
  ink: "#111827",
  muted: "#6B7280",
  soft: "#F3F4F6",
  softer: "#F9FAFB",
  border: "#E5E7EB",
  dark: "#111827",
  dark2: "#1F2937",
  green: "#047857",
  greenSoft: "#ECFDF5",
  orange: "#B45309",
  orangeSoft: "#FFFBEB",
  red: "#B91C1C",
  redSoft: "#FEF2F2",
  blue: "#1D4ED8",
  blueSoft: "#EFF6FF",
};

function makeBusinessDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function getDateRange(businessDate: string) {
  const start = new Date(`${businessDate}T00:00:00`);
  const end = new Date(start);

  end.setDate(end.getDate() + 1);

  return {
    start,
    end,
  };
}

function formatRwf(value: number) {
  return `Rwf ${Number(value || 0).toLocaleString("en-US")}`;
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "Not set";

  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sumBy<T>(rows: T[], getter: (row: T) => number) {
  return rows.reduce((sum, row) => sum + Number(getter(row) || 0), 0);
}

function emptyMethodTotals(): MoneyMethodTotals {
  return {
    cash: 0,
    momo: 0,
    bank: 0,
    card: 0,
    other: 0,
  };
}

function addMethodTotal(
  totals: MoneyMethodTotals,
  method: string,
  amount: number,
) {
  if (method === "cash") totals.cash += amount;
  else if (method === "momo") totals.momo += amount;
  else if (method === "bank") totals.bank += amount;
  else if (method === "card") totals.card += amount;
  else totals.other += amount;
}

function shortText(value: string | null | undefined, maxLength: number) {
  const clean = (value || "-").replace(/\s+/g, " ").trim();

  if (clean.length <= maxLength) return clean;

  return `${clean.slice(0, Math.max(0, maxLength - 1))}…`;
}

function friendlyDirection(value: string) {
  if (value === "money_in") return "Money received";
  if (value === "money_out") return "Money spent";
  if (value === "neutral") return "Cash note";

  return value;
}

function friendlyCategory(value: string) {
  const map: Record<string, string> = {
    sale_payment: "Sale payment",
    sale_deposit: "Sale deposit",
    installment_deposit: "Installment deposit",
    debt_payment: "Debt payment",
    installment_payment: "Installment payment",
    expense: "Expense",
    cash_reopened: "Cash reopened",
    cash_closing_difference: "Closing difference",
    manual_money_movement: "Manual movement",
  };

  return map[value] || value.replace(/_/g, " ");
}

function friendlyStatus(value: string) {
  const map: Record<string, string> = {
    paid: "Paid",
    unpaid: "Unpaid",
    partially_paid: "Partially paid",
    approved: "Approved",
    rejected: "Rejected",
    waiting_owner_review: "Waiting owner review",
    pending: "Pending",
    open: "Open",
    closed: "Closed",
  };

  return map[value] || value.replace(/_/g, " ");
}

function friendlyMethod(value: string) {
  const map: Record<string, string> = {
    cash: "Cash",
    momo: "MoMo",
    bank: "Bank",
    card: "Card",
    other: "Other",
  };

  return map[value] || value;
}

async function buildDailySummaryReport(input: {
  businessDate: string;
  generatedBy: string;
}) {
  const { start, end } = getDateRange(input.businessDate);

  const [cashSession] = await db
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.businessDate, input.businessDate))
    .limit(1);

  const salesRows = await db
    .select({
      id: sales.id,
      saleNumber: sales.saleNumber,
      customerType: sales.customerType,
      walkInName: sales.walkInName,
      totalAmountRwf: sales.totalAmountRwf,
      amountPaidRwf: sales.amountPaidRwf,
      balanceRwf: sales.balanceRwf,
      paymentStatus: sales.paymentStatus,
      createdAt: sales.createdAt,
      customerName: customers.name,
      soldByName: users.name,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .leftJoin(users, eq(sales.soldById, users.id))
    .where(and(gte(sales.createdAt, start), lt(sales.createdAt, end)))
    .orderBy(desc(sales.createdAt));

  const salePaymentRows = await db
    .select()
    .from(salePayments)
    .where(and(gte(salePayments.paidAt, start), lt(salePayments.paidAt, end)));

  const ledgerRows = await db
    .select({
      id: moneyLedger.id,
      direction: moneyLedger.direction,
      amountRwf: moneyLedger.amountRwf,
      method: moneyLedger.method,
      category: moneyLedger.category,
      description: moneyLedger.description,
      actorName: users.name,
      happenedAt: moneyLedger.happenedAt,
    })
    .from(moneyLedger)
    .leftJoin(users, eq(moneyLedger.actorUserId, users.id))
    .where(eq(moneyLedger.businessDate, input.businessDate))
    .orderBy(desc(moneyLedger.happenedAt));

  const approvedExpenseRows = await db
    .select({
      id: expenses.id,
      expenseNumber: expenses.expenseNumber,
      title: expenses.title,
      categoryNameSnapshot: expenses.categoryNameSnapshot,
      amountRwf: expenses.amountRwf,
      method: expenses.method,
      status: expenses.status,
      paidAt: expenses.paidAt,
      createdAt: expenses.createdAt,
      createdByName: users.name,
    })
    .from(expenses)
    .leftJoin(users, eq(expenses.createdById, users.id))
    .where(
      and(
        eq(expenses.status, "approved"),
        gte(expenses.paidAt, start),
        lt(expenses.paidAt, end),
      ),
    )
    .orderBy(desc(expenses.paidAt));

  const pendingExpenseRows = await db
    .select({
      id: expenses.id,
      amountRwf: expenses.amountRwf,
      isActive: expenses.isActive,
      status: expenses.status,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.status, "waiting_owner_review"),
        eq(expenses.isActive, 1),
      ),
    );

  const newDebtRows = await db
    .select()
    .from(customerDebts)
    .where(
      and(
        gte(customerDebts.createdAt, start),
        lt(customerDebts.createdAt, end),
      ),
    );

  const allOpenDebtRows = await db
    .select({
      id: customerDebts.id,
      balanceRwf: customerDebts.balanceRwf,
      status: customerDebts.status,
      expectedPaymentAt: customerDebts.expectedPaymentAt,
      customerName: customers.name,
      customerPhone: customers.phone,
      saleNumber: sales.saleNumber,
    })
    .from(customerDebts)
    .innerJoin(customers, eq(customerDebts.customerId, customers.id))
    .leftJoin(sales, eq(customerDebts.saleId, sales.id))
    .orderBy(desc(customerDebts.createdAt));

  const debtPaymentRows = await db
    .select()
    .from(debtPayments)
    .where(and(gte(debtPayments.paidAt, start), lt(debtPayments.paidAt, end)));

  const productRows = await db.select().from(products);

  const activeProducts = productRows.filter((product) => product.isActive);

  const lowStockRows = activeProducts.filter(
    (product) =>
      Number(product.currentStock || 0) <= Number(product.lowStockAlert || 0),
  );

  const zeroStockRows = activeProducts.filter(
    (product) => Number(product.currentStock || 0) <= 0,
  );

  const openDebtRows = allOpenDebtRows.filter(
    (debt) => Number(debt.balanceRwf || 0) > 0,
  );

  const overdueDebtRows = openDebtRows.filter((debt) => {
    if (!debt.expectedPaymentAt) return false;
    return new Date(debt.expectedPaymentAt).getTime() < Date.now();
  });

  const moneyIn = emptyMethodTotals();
  const moneyOut = emptyMethodTotals();

  for (const row of ledgerRows) {
    if (row.direction === "money_in") {
      addMethodTotal(moneyIn, row.method, Number(row.amountRwf || 0));
    }

    if (row.direction === "money_out") {
      addMethodTotal(moneyOut, row.method, Number(row.amountRwf || 0));
    }
  }

  const moneyInRwf = sumBy(
    ledgerRows.filter((row) => row.direction === "money_in"),
    (row) => row.amountRwf,
  );

  const moneyOutRwf = sumBy(
    ledgerRows.filter((row) => row.direction === "money_out"),
    (row) => row.amountRwf,
  );

  const stockValueRwf = activeProducts.reduce((sum, product) => {
    return (
      sum +
      Number(product.currentStock || 0) * Number(product.buyingPriceRwf || 0)
    );
  }, 0);

  const saleIds = salesRows.map((row) => row.id);

  const soldItemRows =
    saleIds.length > 0
      ? await db
          .select({
            quantity: saleItems.quantity,
            buyingPriceRwf: products.buyingPriceRwf,
          })
          .from(saleItems)
          .leftJoin(products, eq(saleItems.productId, products.id))
          .where(inArray(saleItems.saleId, saleIds))
      : [];

  const estimatedCogsRwf = soldItemRows.reduce((sum, row) => {
    return sum + Number(row.quantity || 0) * Number(row.buyingPriceRwf || 0);
  }, 0);

  const totalSalesRwf = sumBy(salesRows, (row) => row.totalAmountRwf);
  const approvedExpensesRwf = sumBy(
    approvedExpenseRows,
    (row) => row.amountRwf,
  );
  const grossProfitRwf = totalSalesRwf - estimatedCogsRwf;
  const netProfitRwf = grossProfitRwf - approvedExpensesRwf;
  const profitMarginPercent =
    totalSalesRwf > 0
      ? Number(((netProfitRwf / totalSalesRwf) * 100).toFixed(1))
      : 0;

  const amountPaidOnSalesRwf = sumBy(salesRows, (row) => row.amountPaidRwf);

  const ledgerSalePaymentsRwf = sumBy(
    ledgerRows.filter((row) =>
      ["sale_payment", "sale_deposit", "installment_deposit"].includes(
        row.category,
      ),
    ),
    (row) => row.amountRwf,
  );

  const salePaymentDifferenceRwf = amountPaidOnSalesRwf - ledgerSalePaymentsRwf;

  const report: DailySummaryReport = {
    businessName: "Electronic Retail Business Control System",
    reportTitle: "Daily Shop Summary Report",
    businessDate: input.businessDate,
    generatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy,

    cashSession: cashSession
      ? {
          status: cashSession.status,
          openingFloatRwf: cashSession.openingFloatRwf,
          expectedCashRwf: cashSession.expectedCashRwf,
          countedCashRwf: cashSession.countedCashRwf,
          differenceRwf: cashSession.differenceRwf,
          openedAt: cashSession.openedAt
            ? new Date(cashSession.openedAt).toISOString()
            : null,
          closedAt: cashSession.closedAt
            ? new Date(cashSession.closedAt).toISOString()
            : null,
        }
      : null,

    summary: {
      totalSalesRwf,
      amountPaidOnSalesRwf,
      salesBalanceRwf: sumBy(salesRows, (row) => row.balanceRwf),
      salesCount: salesRows.length,

      estimatedCogsRwf,
      grossProfitRwf,
      netProfitRwf,
      profitMarginPercent,

      moneyInRwf,
      moneyOutRwf,
      netMoneyMovementRwf: moneyInRwf - moneyOutRwf,

      approvedExpensesRwf,
      approvedExpensesCount: approvedExpenseRows.length,

      pendingExpensesRwf: sumBy(pendingExpenseRows, (row) => row.amountRwf),
      pendingExpensesCount: pendingExpenseRows.length,

      newCustomerDebtRwf: sumBy(newDebtRows, (row) => row.originalAmountRwf),
      debtPaymentsReceivedRwf: sumBy(debtPaymentRows, (row) => row.amountRwf),
      openCustomerDebtRwf: sumBy(openDebtRows, (row) => row.balanceRwf),
      overdueDebtCount: overdueDebtRows.length,

      stockValueRwf,
      lowStockCount: lowStockRows.length,
      zeroStockCount: zeroStockRows.length,

      ledgerSalePaymentsRwf,
      salePaymentDifferenceRwf,
      dataCheckStatus:
        salePaymentDifferenceRwf === 0 ? "clean" : "needs_review",
    },

    methodTotals: {
      moneyIn,
      moneyOut,
    },

    salesRows: salesRows.slice(0, 30).map((row) => ({
      saleNumber: row.saleNumber,
      customerName: row.customerName || row.walkInName || "Walk-in customer",
      totalAmountRwf: row.totalAmountRwf,
      amountPaidRwf: row.amountPaidRwf,
      balanceRwf: row.balanceRwf,
      paymentStatus: row.paymentStatus,
      soldByName: row.soldByName || "Unknown",
      createdAt: new Date(row.createdAt).toISOString(),
    })),

    moneyRows: ledgerRows.slice(0, 40).map((row) => ({
      time: new Date(row.happenedAt).toISOString(),
      direction: row.direction,
      amountRwf: row.amountRwf,
      method: row.method,
      category: row.category,
      description: row.description || "",
      actorName: row.actorName || "Unknown",
    })),

    expenseRows: approvedExpenseRows.slice(0, 30).map((row) => ({
      expenseNumber: row.expenseNumber,
      title: row.title,
      category: row.categoryNameSnapshot,
      amountRwf: row.amountRwf,
      method: row.method,
      status: row.status,
      createdByName: row.createdByName || "Unknown",
      paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : null,
    })),

    debtRows: openDebtRows.slice(0, 30).map((row) => ({
      customerName: row.customerName,
      customerPhone: row.customerPhone || "No phone",
      saleNumber: row.saleNumber || "No sale number",
      balanceRwf: row.balanceRwf,
      status: row.status,
      expectedPaymentAt: row.expectedPaymentAt
        ? new Date(row.expectedPaymentAt).toISOString()
        : null,
    })),

    lowStockRows: lowStockRows.slice(0, 30).map((row) => ({
      name: row.name,
      sku: row.sku,
      currentStock: row.currentStock,
      lowStockAlert: row.lowStockAlert,
      sellingPriceRwf: row.sellingPriceRwf,
    })),
  };

  void salePaymentRows;

  return report;
}

function reportHasDownloadableData(report: DailySummaryReport) {
  return (
    Boolean(report.cashSession) ||
    report.summary.salesCount > 0 ||
    report.summary.moneyInRwf > 0 ||
    report.summary.moneyOutRwf > 0 ||
    report.summary.approvedExpensesCount > 0 ||
    report.summary.pendingExpensesCount > 0 ||
    report.summary.newCustomerDebtRwf > 0 ||
    report.summary.debtPaymentsReceivedRwf > 0 ||
    report.summary.openCustomerDebtRwf > 0 ||
    report.summary.lowStockCount > 0 ||
    report.summary.zeroStockCount > 0 ||
    report.salesRows.length > 0 ||
    report.moneyRows.length > 0 ||
    report.expenseRows.length > 0 ||
    report.debtRows.length > 0 ||
    report.lowStockRows.length > 0
  );
}

function ensureSpace(doc: PDFKit.PDFDocument, neededHeight: number) {
  if (doc.y + neededHeight > doc.page.height - 72) {
    doc.addPage();
  }
}

function drawLine(doc: PDFKit.PDFDocument, y: number) {
  doc
    .strokeColor(pdfColors.border)
    .lineWidth(1)
    .moveTo(40, y)
    .lineTo(doc.page.width - 40, y)
    .stroke();
}

function drawTopHeader(doc: PDFKit.PDFDocument, report: DailySummaryReport) {
  doc.rect(0, 0, doc.page.width, 104).fill(pdfColors.dark);

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(report.businessName, 40, 26, {
      width: 310,
    });

  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#D1D5DB")
    .text("Audit-controlled shop report", 40, 49, {
      width: 260,
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor("#FFFFFF")
    .text(report.reportTitle, 345, 26, {
      width: 205,
      align: "right",
    });

  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#D1D5DB")
    .text(`Business date: ${report.businessDate}`, 345, 51, {
      width: 205,
      align: "right",
    });

  doc.roundedRect(40, 74, doc.page.width - 80, 18, 5).fill("#374151");

  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor("#FFFFFF")
    .text("OWNER PROOF FILE", 52, 79, { width: 120 });

  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor("#E5E7EB")
    .text(
      "Generated from database records: sales, cash, debts, expenses, stock, and money ledger.",
      175,
      79,
      { width: 360, align: "right" },
    );

  doc.y = 126;
}

function drawReportIdentity(
  doc: PDFKit.PDFDocument,
  report: DailySummaryReport,
) {
  const y = doc.y;

  doc
    .roundedRect(40, y, doc.page.width - 80, 86, 10)
    .fillAndStroke("#FFFFFF", pdfColors.border);

  const columns = [
    {
      label: "Generated by",
      value: report.generatedBy,
      x: 58,
      width: 130,
    },
    {
      label: "Generated time",
      value: formatDateTime(report.generatedAt),
      x: 205,
      width: 145,
    },
    {
      label: "Cash session",
      value: friendlyStatus(report.cashSession?.status || "Not opened"),
      x: 370,
      width: 78,
    },
    {
      label: "Data check",
      value:
        report.summary.dataCheckStatus === "clean" ? "Clean" : "Needs review",
      x: 462,
      width: 72,
    },
  ];

  for (const column of columns) {
    doc
      .fillColor(pdfColors.muted)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(column.label.toUpperCase(), column.x, y + 17, {
        width: column.width,
      });

    doc
      .fillColor(pdfColors.ink)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(shortText(column.value, 26), column.x, y + 35, {
        width: column.width,
      });
  }

  doc
    .fillColor(pdfColors.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(
      "This report is intended to help the shop owner verify money, stock, customer debt, expenses, and daily activity.",
      58,
      y + 60,
      { width: doc.page.width - 116 },
    );

  doc.y = y + 108;
}

function sectionTitle(
  doc: PDFKit.PDFDocument,
  title: string,
  subtitle?: string,
) {
  ensureSpace(doc, 44);

  doc
    .fillColor(pdfColors.ink)
    .font("Helvetica-Bold")
    .fontSize(12.5)
    .text(title, 40, doc.y);

  if (subtitle) {
    doc
      .fillColor(pdfColors.muted)
      .font("Helvetica")
      .fontSize(8.3)
      .text(subtitle, 40, doc.y + 2, {
        width: doc.page.width - 80,
      });
  }

  doc.moveDown(0.7);
  drawLine(doc, doc.y);
  doc.moveDown(0.7);
}

function metricGrid(
  doc: PDFKit.PDFDocument,
  metrics: {
    label: string;
    value: string;
    help: string;
    tone?: "normal" | "good" | "warning" | "danger";
  }[],
) {
  const gap = 12;
  const cardWidth = (doc.page.width - 80 - gap) / 2;
  const cardHeight = 68;

  let x = 40;
  let y = doc.y;

  metrics.forEach((metric, index) => {
    ensureSpace(doc, cardHeight + 18);

    const toneColor =
      metric.tone === "good"
        ? pdfColors.green
        : metric.tone === "warning"
          ? pdfColors.orange
          : metric.tone === "danger"
            ? pdfColors.red
            : pdfColors.blue;

    const toneBg =
      metric.tone === "good"
        ? pdfColors.greenSoft
        : metric.tone === "warning"
          ? pdfColors.orangeSoft
          : metric.tone === "danger"
            ? pdfColors.redSoft
            : pdfColors.blueSoft;

    doc
      .roundedRect(x, y, cardWidth, cardHeight, 9)
      .fillAndStroke("#FFFFFF", pdfColors.border);

    doc.roundedRect(x + 12, y + 10, 7, 7, 2).fill(toneColor);
    doc.roundedRect(x + 25, y + 8, 70, 14, 7).fill(toneBg);

    doc
      .fillColor(toneColor)
      .font("Helvetica-Bold")
      .fontSize(6.8)
      .text("SUMMARY", x + 32, y + 12, { width: 55 });

    doc
      .fillColor(pdfColors.muted)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(metric.label.toUpperCase(), x + 12, y + 28, {
        width: cardWidth - 24,
      });

    doc
      .fillColor(pdfColors.ink)
      .font("Helvetica-Bold")
      .fontSize(15)
      .text(metric.value, x + 12, y + 42, {
        width: cardWidth - 24,
      });

    doc
      .fillColor(pdfColors.muted)
      .font("Helvetica")
      .fontSize(7.5)
      .text(metric.help, x + 12, y + 57, {
        width: cardWidth - 24,
      });

    if (index % 2 === 0) {
      x = 40 + cardWidth + gap;
    } else {
      x = 40;
      y += cardHeight + 12;
    }
  });

  doc.y = metrics.length % 2 === 0 ? y + 6 : y + cardHeight + 16;
}

function drawKeyValueTable(doc: PDFKit.PDFDocument, rows: string[][]) {
  const x = 40;
  const width = doc.page.width - 80;
  const rowHeight = 25;

  ensureSpace(doc, rows.length * rowHeight + 14);

  rows.forEach((row, index) => {
    const y = doc.y;
    const bg = index % 2 === 0 ? "#FFFFFF" : pdfColors.softer;

    doc.rect(x, y, width, rowHeight).fillAndStroke(bg, pdfColors.border);

    doc
      .fillColor(pdfColors.ink)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(row[0], x + 10, y + 8, { width: 165 });

    doc
      .fillColor(pdfColors.muted)
      .font("Helvetica")
      .fontSize(8.5)
      .text(row[1], x + 190, y + 8, { width: width - 205 });

    doc.y += rowHeight;
  });

  doc.moveDown(0.8);
}

function drawTable(
  doc: PDFKit.PDFDocument,
  input: {
    columns: { label: string; width: number; align?: "left" | "right" }[];
    rows: string[][];
    emptyText: string;
  },
) {
  const startX = 40;
  const tableWidth = input.columns.reduce(
    (sum, column) => sum + column.width,
    0,
  );
  const headerHeight = 24;

  ensureSpace(doc, headerHeight + 35);

  let y = doc.y;

  doc
    .rect(startX, y, tableWidth, headerHeight)
    .fillAndStroke(pdfColors.dark2, pdfColors.dark2);

  let x = startX;

  input.columns.forEach((column) => {
    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(column.label, x + 5, y + 8, {
        width: column.width - 10,
        align: column.align || "left",
      });

    x += column.width;
  });

  doc.y = y + headerHeight;

  if (input.rows.length === 0) {
    doc
      .rect(startX, doc.y, tableWidth, 32)
      .fillAndStroke("#FFFFFF", pdfColors.border);

    doc
      .fillColor(pdfColors.muted)
      .font("Helvetica")
      .fontSize(8.5)
      .text(input.emptyText, startX + 8, doc.y + 11, {
        width: tableWidth - 16,
      });

    doc.y += 42;
    return;
  }

  input.rows.forEach((row, rowIndex) => {
    const rowHeight = 28;

    ensureSpace(doc, rowHeight + 16);

    y = doc.y;
    x = startX;

    const bg = rowIndex % 2 === 0 ? "#FFFFFF" : pdfColors.softer;

    doc
      .rect(startX, y, tableWidth, rowHeight)
      .fillAndStroke(bg, pdfColors.border);

    row.forEach((value, columnIndex) => {
      const column = input.columns[columnIndex];

      doc
        .fillColor(pdfColors.ink)
        .font("Helvetica")
        .fontSize(7.2)
        .text(shortText(value, 36), x + 5, y + 9, {
          width: column.width - 10,
          align: column.align || "left",
          lineBreak: false,
        });

      x += column.width;
    });

    doc.y += rowHeight;
  });

  doc.moveDown(1);
}

function drawCashSessionProof(
  doc: PDFKit.PDFDocument,
  report: DailySummaryReport,
) {
  const cash = report.cashSession;

  const rows = cash
    ? [
        ["Status", friendlyStatus(cash.status)],
        ["Opening float", formatRwf(cash.openingFloatRwf)],
        ["Expected cash", formatRwf(cash.expectedCashRwf)],
        [
          "Counted cash",
          cash.countedCashRwf === null
            ? "Not counted yet"
            : formatRwf(cash.countedCashRwf),
        ],
        ["Difference", formatRwf(cash.differenceRwf)],
        ["Opened at", formatDateTime(cash.openedAt)],
        ["Closed at", formatDateTime(cash.closedAt)],
      ]
    : [["Status", "Cash session not opened for this date"]];

  drawKeyValueTable(doc, rows);
}

function drawDataCheck(doc: PDFKit.PDFDocument, report: DailySummaryReport) {
  const isClean = report.summary.dataCheckStatus === "clean";
  const y = doc.y;

  ensureSpace(doc, 98);

  doc
    .roundedRect(40, y, doc.page.width - 80, 86, 10)
    .fillAndStroke(
      isClean ? pdfColors.greenSoft : pdfColors.orangeSoft,
      pdfColors.border,
    );

  doc
    .fillColor(isClean ? pdfColors.green : pdfColors.orange)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(
      isClean ? "Payment records match" : "Owner review needed",
      58,
      y + 15,
    );

  doc
    .fillColor(pdfColors.ink)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      isClean
        ? "Money paid on sales matches the money received records for this date."
        : "Money paid on sales and money received records do not fully match. Review this before filing the report.",
      58,
      y + 34,
      { width: doc.page.width - 116 },
    );

  doc
    .fillColor(pdfColors.muted)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(
      `Paid on sales: ${formatRwf(
        report.summary.amountPaidOnSalesRwf,
      )}   |   Money received records: ${formatRwf(
        report.summary.ledgerSalePaymentsRwf,
      )}   |   Difference: ${formatRwf(
        report.summary.salePaymentDifferenceRwf,
      )}`,
      58,
      y + 61,
      { width: doc.page.width - 116 },
    );

  doc.y = y + 106;
}

function drawProofStatement(doc: PDFKit.PDFDocument) {
  ensureSpace(doc, 110);

  const y = doc.y;

  doc
    .roundedRect(40, y, doc.page.width - 80, 90, 10)
    .fillAndStroke(pdfColors.blueSoft, pdfColors.border);

  doc
    .fillColor(pdfColors.blue)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Proof statement", 58, y + 16);

  doc
    .fillColor(pdfColors.ink)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "Owner should review this report before keeping it as the final daily shop proof.",
      58,
      y + 36,
      { width: doc.page.width - 116, lineGap: 2 },
    );

  doc
    .fillColor(pdfColors.muted)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(
      "Owner review recommended before final filing, especially after reopening cash or correcting old test data.",
      58,
      y + 74,
      { width: doc.page.width - 116 },
    );

  doc.y = y + 110;
}

function addPageNumbers(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index);

    const footerLineY = doc.page.height - 64;
    const footerTextY = doc.page.height - 54;

    doc
      .strokeColor(pdfColors.border)
      .lineWidth(1)
      .moveTo(40, footerLineY)
      .lineTo(doc.page.width - 40, footerLineY)
      .stroke();

    doc
      .fillColor(pdfColors.muted)
      .font("Helvetica")
      .fontSize(7)
      .text(
        "Daily shop proof file generated from saved system records.",
        40,
        footerTextY,
        {
          width: 360,
          lineBreak: false,
        },
      );

    doc
      .fillColor(pdfColors.muted)
      .font("Helvetica")
      .fontSize(7)
      .text(
        `Page ${index + 1} of ${range.count}`,
        doc.page.width - 130,
        footerTextY,
        {
          width: 90,
          align: "right",
          lineBreak: false,
        },
      );
  }

  doc.switchToPage(range.start + range.count - 1);
}

function buildDailySummaryPdf(report: DailySummaryReport) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      bufferPages: true,
      info: {
        Title: `${report.reportTitle} - ${report.businessDate}`,
        Author: report.businessName,
        Subject: "Daily shop control report",
        Creator: "Electronic Retail Business Control System",
      },
    });

    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    drawTopHeader(doc, report);
    drawReportIdentity(doc, report);

    sectionTitle(
      doc,
      "Executive Summary",
      "Owner-level view of sales, money, debts, expenses, stock, and cash control.",
    );

    metricGrid(doc, [
      {
        label: "Total sales",
        value: formatRwf(report.summary.totalSalesRwf),
        help: `${report.summary.salesCount} sale(s) recorded`,
        tone: "good",
      },
      {
        label: "Estimated COGS",
        value: formatRwf(report.summary.estimatedCogsRwf),
        help: "Estimated cost of sold products",
        tone: report.summary.estimatedCogsRwf > 0 ? "warning" : "normal",
      },
      {
        label: "Gross profit",
        value: formatRwf(report.summary.grossProfitRwf),
        help: "Sales minus estimated product cost",
        tone: report.summary.grossProfitRwf >= 0 ? "good" : "danger",
      },
      {
        label: "Net profit / loss",
        value: formatRwf(report.summary.netProfitRwf),
        help: `${report.summary.profitMarginPercent}% net margin`,
        tone: report.summary.netProfitRwf >= 0 ? "good" : "danger",
      },
      {
        label: "Money received",
        value: formatRwf(report.summary.moneyInRwf),
        help: "All money received in the ledger",
        tone: "good",
      },
      {
        label: "Money spent",
        value: formatRwf(report.summary.moneyOutRwf),
        help: "Expenses and other money-out records",
        tone: report.summary.moneyOutRwf > 0 ? "warning" : "normal",
      },
      {
        label: "Net money movement",
        value: formatRwf(report.summary.netMoneyMovementRwf),
        help: "Money received minus money spent",
        tone: report.summary.netMoneyMovementRwf >= 0 ? "good" : "danger",
      },
      {
        label: "Open customer debt",
        value: formatRwf(report.summary.openCustomerDebtRwf),
        help: `${report.summary.overdueDebtCount} overdue debt(s)`,
        tone: report.summary.openCustomerDebtRwf > 0 ? "warning" : "good",
      },
      {
        label: "Stock value",
        value: formatRwf(report.summary.stockValueRwf),
        help: `${report.summary.lowStockCount} low-stock product(s)`,
        tone: report.summary.lowStockCount > 0 ? "warning" : "good",
      },
    ]);

    sectionTitle(
      doc,
      "Payment Check",
      "Compare money paid on sales with saved money records.",
    );
    drawDataCheck(doc, report);

    sectionTitle(
      doc,
      "Cash Session Proof",
      "Drawer control for the selected business date.",
    );
    drawCashSessionProof(doc, report);

    sectionTitle(
      doc,
      "Payment Method Breakdown",
      "Money received and money spent by payment method.",
    );
    drawTable(doc, {
      columns: [
        { label: "Method", width: 105 },
        { label: "Received", width: 125, align: "right" },
        { label: "Spent", width: 125, align: "right" },
        { label: "Net", width: 155, align: "right" },
      ],
      rows: [
        [
          "Cash",
          formatRwf(report.methodTotals.moneyIn.cash),
          formatRwf(report.methodTotals.moneyOut.cash),
          formatRwf(
            report.methodTotals.moneyIn.cash -
              report.methodTotals.moneyOut.cash,
          ),
        ],
        [
          "MoMo",
          formatRwf(report.methodTotals.moneyIn.momo),
          formatRwf(report.methodTotals.moneyOut.momo),
          formatRwf(
            report.methodTotals.moneyIn.momo -
              report.methodTotals.moneyOut.momo,
          ),
        ],
        [
          "Bank",
          formatRwf(report.methodTotals.moneyIn.bank),
          formatRwf(report.methodTotals.moneyOut.bank),
          formatRwf(
            report.methodTotals.moneyIn.bank -
              report.methodTotals.moneyOut.bank,
          ),
        ],
        [
          "Card",
          formatRwf(report.methodTotals.moneyIn.card),
          formatRwf(report.methodTotals.moneyOut.card),
          formatRwf(
            report.methodTotals.moneyIn.card -
              report.methodTotals.moneyOut.card,
          ),
        ],
        [
          "Other",
          formatRwf(report.methodTotals.moneyIn.other),
          formatRwf(report.methodTotals.moneyOut.other),
          formatRwf(
            report.methodTotals.moneyIn.other -
              report.methodTotals.moneyOut.other,
          ),
        ],
      ],
      emptyText: "No payment method records found.",
    });

    doc.addPage();

    sectionTitle(
      doc,
      "Sales Recorded",
      "Sales saved for the selected business date.",
    );
    drawTable(doc, {
      columns: [
        { label: "Sale No.", width: 98 },
        { label: "Customer", width: 103 },
        { label: "Total", width: 76, align: "right" },
        { label: "Paid", width: 76, align: "right" },
        { label: "Balance", width: 76, align: "right" },
        { label: "Status", width: 81 },
      ],
      rows: report.salesRows.map((row) => [
        shortText(row.saleNumber, 18),
        shortText(row.customerName, 20),
        formatRwf(row.totalAmountRwf),
        formatRwf(row.amountPaidRwf),
        formatRwf(row.balanceRwf),
        friendlyStatus(row.paymentStatus),
      ]),
      emptyText: "No sales recorded for this date.",
    });

    sectionTitle(
      doc,
      "Approved Expenses",
      "Approved money-out records for the selected date.",
    );
    drawTable(doc, {
      columns: [
        { label: "Expense No.", width: 100 },
        { label: "Title", width: 138 },
        { label: "Category", width: 90 },
        { label: "Amount", width: 82, align: "right" },
        { label: "Method", width: 50 },
        { label: "By", width: 50 },
      ],
      rows: report.expenseRows.map((row) => [
        shortText(row.expenseNumber, 18),
        shortText(row.title, 28),
        shortText(row.category, 18),
        formatRwf(row.amountRwf),
        friendlyMethod(row.method),
        shortText(row.createdByName, 12),
      ]),
      emptyText: "No approved expenses recorded for this date.",
    });

    sectionTitle(doc, "Open Customer Debts", "Customers who still owe money.");
    drawTable(doc, {
      columns: [
        { label: "Customer", width: 112 },
        { label: "Phone", width: 80 },
        { label: "Sale No.", width: 96 },
        { label: "Balance", width: 82, align: "right" },
        { label: "Expected", width: 140 },
      ],
      rows: report.debtRows.map((row) => [
        shortText(row.customerName, 22),
        shortText(row.customerPhone, 15),
        shortText(row.saleNumber, 18),
        formatRwf(row.balanceRwf),
        formatDateTime(row.expectedPaymentAt),
      ]),
      emptyText: "No open customer debts found.",
    });

    doc.addPage();

    sectionTitle(
      doc,
      "Low Stock Products",
      "Products requiring owner attention.",
    );
    drawTable(doc, {
      columns: [
        { label: "Product", width: 145 },
        { label: "SKU", width: 150 },
        { label: "Stock", width: 55, align: "right" },
        { label: "Alert", width: 55, align: "right" },
        { label: "Selling price", width: 105, align: "right" },
      ],
      rows: report.lowStockRows.map((row) => [
        shortText(row.name, 28),
        shortText(row.sku, 24),
        String(row.currentStock),
        String(row.lowStockAlert),
        formatRwf(row.sellingPriceRwf),
      ]),
      emptyText: "No low-stock products found.",
    });

    sectionTitle(
      doc,
      "Money Ledger Proof",
      "Latest money records for the selected business date.",
    );
    drawTable(doc, {
      columns: [
        { label: "Time", width: 95 },
        { label: "Type", width: 82 },
        { label: "Amount", width: 82, align: "right" },
        { label: "Method", width: 54 },
        { label: "Category", width: 88 },
        { label: "Description", width: 109 },
      ],
      rows: report.moneyRows.map((row) => [
        formatDateTime(row.time),
        friendlyDirection(row.direction),
        formatRwf(row.amountRwf),
        friendlyMethod(row.method),
        friendlyCategory(row.category),
        shortText(row.description, 26),
      ]),
      emptyText: "No money ledger records found for this date.",
    });

    sectionTitle(doc, "Report Filing Note");
    drawProofStatement(doc);

    addPageNumbers(doc);

    doc.end();
  });
}

export async function reportsRoutes(app: FastifyInstance) {
  app.get(
    "/daily-summary",
    {
      preHandler: [requireAuth, requirePermission("reports.view")],
    },
    async (request, reply) => {
      const query = reportQuerySchema.safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid report date.",
        });
      }

      const auth = request.authUser! as AuthReportUser;
      const businessDate = query.data.date || makeBusinessDate();

      const report = await buildDailySummaryReport({
        businessDate,
        generatedBy: auth.name || auth.email || auth.id,
      });

      return {
        ok: true,
        report,
      };
    },
  );

  app.get(
    "/daily-summary/pdf",
    {
      preHandler: [requireAuth, requirePermission("reports.view")],
    },
    async (request, reply) => {
      const query = reportQuerySchema.safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid report date.",
        });
      }

      const auth = request.authUser! as AuthReportUser;
      const businessDate = query.data.date || makeBusinessDate();

      const report = await buildDailySummaryReport({
        businessDate,
        generatedBy: auth.name || auth.email || auth.id,
      });

      if (!reportHasDownloadableData(report)) {
        return reply.code(404).send({
          ok: false,
          message: "No report data found for this date. Nothing to download.",
        });
      }

      const pdfBuffer = await buildDailySummaryPdf(report);
      const filename = `daily-shop-summary-${businessDate}.pdf`;

      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(pdfBuffer);
    },
  );
}
