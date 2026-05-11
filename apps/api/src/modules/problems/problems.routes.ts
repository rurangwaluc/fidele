import {
  cashSessions,
  customerDebtInstallments,
  customerDebts,
  customers,
  db,
  expenses,
  moneyLedger,
  products,
  sales,
} from "@erc/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";

import type { FastifyInstance } from "fastify";
import { z } from "zod";

const problemsQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

type ProblemSeverity = "critical" | "warning" | "info";
type ProblemCategory = "cash" | "debt" | "expense" | "stock" | "sales";

type ShopProblem = {
  id: string;
  category: ProblemCategory;
  severity: ProblemSeverity;
  title: string;
  message: string;
  actionLabel: string;
  actionHref: string;
  detectedAt: string;
};

function makeBusinessDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function toBusinessDate(value: Date | string) {
  const date = new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function isSameBusinessDate(
  value: Date | string | null | undefined,
  businessDate: string,
) {
  if (!value) return false;

  return toBusinessDate(value) === businessDate;
}

function isPast(value: Date | string | null | undefined) {
  if (!value) return false;

  return new Date(value).getTime() < Date.now();
}

function formatRwf(value: number) {
  return `Rwf ${Number(value || 0).toLocaleString("en-US")}`;
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "not set";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortProblems(problems: ShopProblem[]) {
  const severityRank: Record<ProblemSeverity, number> = {
    critical: 1,
    warning: 2,
    info: 3,
  };

  return [...problems].sort((a, b) => {
    const severityDifference =
      severityRank[a.severity] - severityRank[b.severity];

    if (severityDifference !== 0) return severityDifference;

    return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
  });
}

function makeProblem(input: ShopProblem) {
  return input;
}

export async function problemsRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      preHandler: [requireAuth, requirePermission("problems.view")],
    },
    async (request, reply) => {
      const query = problemsQuerySchema.safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid problems date.",
        });
      }

      const businessDate = query.data.date || makeBusinessDate();
      const nowIso = new Date().toISOString();

      const cashProblems: ShopProblem[] = [];
      const debtProblems: ShopProblem[] = [];
      const expenseProblems: ShopProblem[] = [];
      const stockProblems: ShopProblem[] = [];
      const salesProblems: ShopProblem[] = [];

      const [cashSession] = await db
        .select()
        .from(cashSessions)
        .where(eq(cashSessions.businessDate, businessDate))
        .limit(1);

      if (!cashSession) {
        cashProblems.push(
          makeProblem({
            id: `cash-not-opened-${businessDate}`,
            category: "cash",
            severity: "critical",
            title: "Cash is not open",
            message:
              "Open cash before selling, receiving customer payments, or recording paid expenses.",
            actionLabel: "Open cash",
            actionHref: "/cash",
            detectedAt: nowIso,
          }),
        );
      }

      if (cashSession?.status === "closed") {
        cashProblems.push(
          makeProblem({
            id: `cash-closed-${cashSession.id}`,
            category: "cash",
            severity: "warning",
            title: "Cash is closed",
            message:
              "The day is closed. New sales and payments should stay blocked unless the owner reopens cash.",
            actionLabel: "View cash",
            actionHref: "/cash",
            detectedAt: cashSession.closedAt
              ? new Date(cashSession.closedAt).toISOString()
              : nowIso,
          }),
        );
      }

      if (cashSession && Number(cashSession.differenceRwf || 0) !== 0) {
        cashProblems.push(
          makeProblem({
            id: `cash-difference-${cashSession.id}`,
            category: "cash",
            severity: "critical",
            title: "Cash difference found",
            message: `Counted cash and expected cash differ by ${formatRwf(
              Math.abs(Number(cashSession.differenceRwf || 0)),
            )}. The owner should review this before filing the day.`,
            actionLabel: "Review cash",
            actionHref: "/cash",
            detectedAt: cashSession.closedAt
              ? new Date(cashSession.closedAt).toISOString()
              : nowIso,
          }),
        );
      }

      const businessDateLedgerRows = await db
        .select()
        .from(moneyLedger)
        .where(eq(moneyLedger.businessDate, businessDate))
        .orderBy(desc(moneyLedger.happenedAt));

      const reopenedCash = businessDateLedgerRows.find(
        (row) => row.category === "cash_reopened",
      );

      if (reopenedCash) {
        cashProblems.push(
          makeProblem({
            id: `cash-reopened-${reopenedCash.id}`,
            category: "cash",
            severity: "info",
            title: "Cash was reopened",
            message:
              "Cash was reopened for this date. Review the day carefully before closing again.",
            actionLabel: "Review cash",
            actionHref: "/cash",
            detectedAt: new Date(reopenedCash.happenedAt).toISOString(),
          }),
        );
      }

      const openDebtRows = await db
        .select({
          id: customerDebts.id,
          balanceRwf: customerDebts.balanceRwf,
          status: customerDebts.status,
          expectedPaymentAt: customerDebts.expectedPaymentAt,
          createdAt: customerDebts.createdAt,
          customerName: customers.name,
          customerPhone: customers.phone,
          saleNumber: sales.saleNumber,
        })
        .from(customerDebts)
        .innerJoin(customers, eq(customerDebts.customerId, customers.id))
        .leftJoin(sales, eq(customerDebts.saleId, sales.id))
        .orderBy(desc(customerDebts.createdAt));

      for (const debt of openDebtRows) {
        const balanceRwf = Number(debt.balanceRwf || 0);

        if (balanceRwf <= 0 || debt.status === "paid") continue;

        if (isPast(debt.expectedPaymentAt)) {
          debtProblems.push(
            makeProblem({
              id: `debt-overdue-${debt.id}`,
              category: "debt",
              severity: "critical",
              title: "Customer payment is overdue",
              message: `${debt.customerName} still owes ${formatRwf(
                balanceRwf,
              )}. Expected payment was ${formatDateTime(
                debt.expectedPaymentAt,
              )}.`,
              actionLabel: "View debt",
              actionHref: "/debts",
              detectedAt: debt.expectedPaymentAt
                ? new Date(debt.expectedPaymentAt).toISOString()
                : nowIso,
            }),
          );

          continue;
        }

        if (isSameBusinessDate(debt.expectedPaymentAt, businessDate)) {
          debtProblems.push(
            makeProblem({
              id: `debt-due-today-${debt.id}`,
              category: "debt",
              severity: "warning",
              title: "Customer payment is due today",
              message: `${debt.customerName} should pay ${formatRwf(
                balanceRwf,
              )} today. Follow up before closing the day.`,
              actionLabel: "View debt",
              actionHref: "/debts",
              detectedAt: debt.expectedPaymentAt
                ? new Date(debt.expectedPaymentAt).toISOString()
                : nowIso,
            }),
          );
        }
      }

      const installmentRows = await db
        .select({
          id: customerDebtInstallments.id,
          debtId: customerDebtInstallments.debtId,
          saleId: customerDebtInstallments.saleId,
          installmentNumber: customerDebtInstallments.installmentNumber,
          balanceRwf: customerDebtInstallments.balanceRwf,
          dueAt: customerDebtInstallments.dueAt,
          status: customerDebtInstallments.status,
          customerName: customers.name,
          saleNumber: sales.saleNumber,
        })
        .from(customerDebtInstallments)
        .innerJoin(
          customerDebts,
          eq(customerDebtInstallments.debtId, customerDebts.id),
        )
        .innerJoin(customers, eq(customerDebts.customerId, customers.id))
        .leftJoin(sales, eq(customerDebtInstallments.saleId, sales.id))
        .orderBy(customerDebtInstallments.installmentNumber);

      for (const installment of installmentRows) {
        const balanceRwf = Number(installment.balanceRwf || 0);

        if (balanceRwf <= 0 || installment.status === "paid") continue;

        if (isPast(installment.dueAt)) {
          debtProblems.push(
            makeProblem({
              id: `installment-overdue-${installment.id}`,
              category: "debt",
              severity: "critical",
              title: "Installment payment is overdue",
              message: `${installment.customerName} has installment #${
                installment.installmentNumber
              } overdue. Balance is ${formatRwf(balanceRwf)}.`,
              actionLabel: "View installments",
              actionHref: "/debts",
              detectedAt: new Date(installment.dueAt).toISOString(),
            }),
          );

          continue;
        }

        if (isSameBusinessDate(installment.dueAt, businessDate)) {
          debtProblems.push(
            makeProblem({
              id: `installment-due-today-${installment.id}`,
              category: "debt",
              severity: "warning",
              title: "Installment payment is due today",
              message: `${installment.customerName} should pay installment #${
                installment.installmentNumber
              } today. Balance is ${formatRwf(balanceRwf)}.`,
              actionLabel: "View installments",
              actionHref: "/debts",
              detectedAt: new Date(installment.dueAt).toISOString(),
            }),
          );
        }
      }

      const expenseRows = await db
        .select({
          id: expenses.id,
          expenseNumber: expenses.expenseNumber,
          title: expenses.title,
          categoryNameSnapshot: expenses.categoryNameSnapshot,
          amountRwf: expenses.amountRwf,
          method: expenses.method,
          status: expenses.status,
          isActive: expenses.isActive,
          createdAt: expenses.createdAt,
          paidAt: expenses.paidAt,
        })
        .from(expenses)
        .orderBy(desc(expenses.createdAt));

      for (const expense of expenseRows) {
        if (!expense.isActive) continue;

        if (expense.status === "waiting_owner_review") {
          expenseProblems.push(
            makeProblem({
              id: `expense-waiting-${expense.id}`,
              category: "expense",
              severity: "warning",
              title: "Expense is waiting for owner approval",
              message: `${expense.title} needs review before it affects shop money. Amount: ${formatRwf(
                Number(expense.amountRwf || 0),
              )}.`,
              actionLabel: "Review expense",
              actionHref: "/expenses",
              detectedAt: new Date(expense.createdAt).toISOString(),
            }),
          );
        }

        if (expense.status === "rejected") {
          expenseProblems.push(
            makeProblem({
              id: `expense-rejected-${expense.id}`,
              category: "expense",
              severity: "info",
              title: "Expense was rejected",
              message: `${expense.title} was rejected. Check if it needs correction or follow-up.`,
              actionLabel: "View expenses",
              actionHref: "/expenses",
              detectedAt: new Date(expense.createdAt).toISOString(),
            }),
          );
        }
      }

      const productRows = await db
        .select()
        .from(products)
        .orderBy(desc(products.createdAt));

      for (const product of productRows) {
        if (!product.isActive) continue;

        const currentStock = Number(product.currentStock || 0);
        const lowStockAlert = Number(product.lowStockAlert || 0);

        if (currentStock <= 0) {
          stockProblems.push(
            makeProblem({
              id: `stock-zero-${product.id}`,
              category: "stock",
              severity: "critical",
              title: "Product is out of stock",
              message: `${product.name} has 0 available units. Customers cannot buy it until stock is added.`,
              actionLabel: "Add stock",
              actionHref: "/inventory",
              detectedAt: new Date(
                product.updatedAt || product.createdAt,
              ).toISOString(),
            }),
          );

          continue;
        }

        if (currentStock <= lowStockAlert) {
          stockProblems.push(
            makeProblem({
              id: `stock-low-${product.id}`,
              category: "stock",
              severity: "warning",
              title: "Product stock is low",
              message: `${product.name} has ${currentStock} unit(s) left. Alert level is ${lowStockAlert}.`,
              actionLabel: "Add stock",
              actionHref: "/inventory",
              detectedAt: new Date(
                product.updatedAt || product.createdAt,
              ).toISOString(),
            }),
          );
        }
      }

      const salesRows = await db
        .select({
          id: sales.id,
          saleNumber: sales.saleNumber,
          totalAmountRwf: sales.totalAmountRwf,
          amountPaidRwf: sales.amountPaidRwf,
          balanceRwf: sales.balanceRwf,
          paymentStatus: sales.paymentStatus,
          createdAt: sales.createdAt,
          customerName: customers.name,
          walkInName: sales.walkInName,
        })
        .from(sales)
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .orderBy(desc(sales.createdAt));

      for (const sale of salesRows) {
        if (!isSameBusinessDate(sale.createdAt, businessDate)) continue;

        const balanceRwf = Number(sale.balanceRwf || 0);

        if (balanceRwf <= 0) continue;

        salesProblems.push(
          makeProblem({
            id: `sale-balance-${sale.id}`,
            category: "sales",
            severity: "info",
            title: "Sale still has unpaid balance",
            message: `${sale.customerName || sale.walkInName || "Customer"} still has ${formatRwf(
              balanceRwf,
            )} unpaid on sale ${sale.saleNumber}.`,
            actionLabel: "View sales",
            actionHref: "/sales",
            detectedAt: new Date(sale.createdAt).toISOString(),
          }),
        );
      }

      const allProblems = sortProblems([
        ...cashProblems,
        ...debtProblems,
        ...expenseProblems,
        ...stockProblems,
        ...salesProblems,
      ]);

      const summary = {
        total: allProblems.length,
        critical: allProblems.filter(
          (problem) => problem.severity === "critical",
        ).length,
        warning: allProblems.filter((problem) => problem.severity === "warning")
          .length,
        info: allProblems.filter((problem) => problem.severity === "info")
          .length,
        cleanAreas: [
          cashProblems.length === 0 ? "Cash" : null,
          debtProblems.length === 0 ? "Customer payments" : null,
          expenseProblems.length === 0 ? "Expenses" : null,
          stockProblems.length === 0 ? "Stock" : null,
          salesProblems.length === 0 ? "Sales" : null,
        ].filter((item): item is string => Boolean(item)),
      };

      return {
        ok: true,
        businessDate,
        summary,
        problems: allProblems,
        groups: {
          cashProblems: sortProblems(cashProblems),
          debtProblems: sortProblems(debtProblems),
          expenseProblems: sortProblems(expenseProblems),
          stockProblems: sortProblems(stockProblems),
          salesProblems: sortProblems(salesProblems),
        },
      };
    },
  );
}
