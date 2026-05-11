"use client";

import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";
import {
  CashSession,
  CashTotals,
  MoneyLedgerEntry,
  getCashToday,
} from "@/lib/cash";
import { CustomerDebt, getDebts } from "@/lib/debts";
import { Expense, getExpenses } from "@/lib/expenses";
import { Product, getProducts } from "@/lib/products";
import { SaleListItem, getSales } from "@/lib/sales";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { getToken } from "@/lib/auth";
import { useRouter } from "next/navigation";

function formatRwf(value: number) {
  return `Rwf ${Number(value || 0).toLocaleString("en-US")}`;
}

function formatDate(value: string | null) {
  if (!value) return "Not set";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function localDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

const emptyTotals: CashTotals = {
  moneyInRwf: 0,
  moneyOutRwf: 0,

  cashInRwf: 0,
  cashOutRwf: 0,

  momoInRwf: 0,
  momoOutRwf: 0,

  bankInRwf: 0,
  bankOutRwf: 0,

  cardInRwf: 0,
  cardOutRwf: 0,

  otherInRwf: 0,
  otherOutRwf: 0,

  expectedCashRwf: 0,
};

export default function DashboardPage() {
  const router = useRouter();

  const [businessDate, setBusinessDate] = useState(localDateKey(new Date()));
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [cashTotals, setCashTotals] = useState<CashTotals>(emptyTotals);
  const [ledger, setLedger] = useState<MoneyLedgerEntry[]>([]);
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const [debts, setDebts] = useState<CustomerDebt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const isCashOpen = cashSession?.status === "open";
  const isCashClosed = cashSession?.status === "closed";
  const cashNotOpened = !cashSession;

  const todaySales = useMemo(
    () => sales.filter((sale) => localDateKey(sale.createdAt) === businessDate),
    [businessDate, sales],
  );

  const todaySalesTotal = useMemo(
    () =>
      todaySales.reduce(
        (sum, sale) => sum + Number(sale.totalAmountRwf || 0),
        0,
      ),
    [todaySales],
  );

  const todayPaidTotal = useMemo(
    () =>
      todaySales.reduce(
        (sum, sale) => sum + Number(sale.amountPaidRwf || 0),
        0,
      ),
    [todaySales],
  );

  const openDebts = useMemo(
    () => debts.filter((debt) => Number(debt.balanceRwf || 0) > 0),
    [debts],
  );

  const openDebtTotal = useMemo(
    () =>
      openDebts.reduce((sum, debt) => sum + Number(debt.balanceRwf || 0), 0),
    [openDebts],
  );

  const debtsDueToday = useMemo(() => {
    return openDebts.filter((debt) => {
      if (!debt.expectedPaymentAt) return false;
      return localDateKey(debt.expectedPaymentAt) === businessDate;
    });
  }, [businessDate, openDebts]);

  const overdueDebts = useMemo(() => {
    return openDebts.filter((debt) => {
      if (!debt.expectedPaymentAt) return false;
      return new Date(debt.expectedPaymentAt).getTime() < Date.now();
    });
  }, [openDebts]);

  const lowStockProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.isActive &&
          Number(product.currentStock || 0) <=
            Number(product.lowStockAlert || 0),
      ),
    [products],
  );

  const stockValue = useMemo(
    () =>
      products.reduce(
        (sum, product) =>
          sum +
          Number(product.currentStock || 0) *
            Number(product.buyingPriceRwf || 0),
        0,
      ),
    [products],
  );

  const approvedExpenses = useMemo(
    () => expenses.filter((expense) => expense.status === "approved"),
    [expenses],
  );

  const pendingExpenses = useMemo(
    () =>
      expenses.filter(
        (expense) =>
          expense.status === "waiting_owner_review" && expense.isActive === 1,
      ),
    [expenses],
  );

  const todayExpenses = useMemo(() => {
    return approvedExpenses.filter((expense) => {
      const dateValue = expense.paidAt || expense.createdAt;
      return localDateKey(dateValue) === businessDate;
    });
  }, [approvedExpenses, businessDate]);

  const todayExpensesTotal = useMemo(
    () =>
      todayExpenses.reduce(
        (sum, expense) => sum + Number(expense.amountRwf || 0),
        0,
      ),
    [todayExpenses],
  );

  const pendingExpenseTotal = useMemo(
    () =>
      pendingExpenses.reduce(
        (sum, expense) => sum + Number(expense.amountRwf || 0),
        0,
      ),
    [pendingExpenses],
  );

  const netMoneyMovement = useMemo(
    () =>
      Number(cashTotals.moneyInRwf || 0) - Number(cashTotals.moneyOutRwf || 0),
    [cashTotals.moneyInRwf, cashTotals.moneyOutRwf],
  );

  const cashReopenedToday = useMemo(
    () => ledger.some((entry) => entry.category === "cash_reopened"),
    [ledger],
  );

  const hasCashDifference =
    isCashClosed && Number(cashSession?.differenceRwf || 0) !== 0;

  const problemCount = useMemo(() => {
    let count = 0;

    count += lowStockProducts.length;
    count += overdueDebts.length;
    count += pendingExpenses.length;

    if (hasCashDifference) count += 1;
    if (cashReopenedToday) count += 1;

    return count;
  }, [
    cashReopenedToday,
    hasCashDifference,
    lowStockProducts.length,
    overdueDebts.length,
    pendingExpenses.length,
  ]);

  const latestSales = useMemo(() => sales.slice(0, 4), [sales]);
  const topOpenDebts = useMemo(() => openDebts.slice(0, 4), [openDebts]);
  const latestExpenses = useMemo(() => expenses.slice(0, 4), [expenses]);
  const latestLedger = useMemo(() => ledger.slice(0, 6), [ledger]);

  const shopStatusTitle = isCashOpen
    ? "Shop is open. Selling is allowed."
    : cashNotOpened
      ? "Cash is not open. Open cash before work starts."
      : "Cash is closed. Selling and payments are blocked.";

  const shopStatusHelp = isCashOpen
    ? `Expected cash in drawer is ${formatRwf(cashTotals.expectedCashRwf)}.`
    : cashNotOpened
      ? "Open cash first so sales, payments, and expenses can be controlled."
      : "Only the owner can reopen cash if correction is needed.";

  const mainActionLabel = isCashOpen
    ? "Start selling"
    : cashNotOpened
      ? "Open cash"
      : "View cash";

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setMessage("");

    try {
      const [
        cashResult,
        salesResult,
        debtsResult,
        productsResult,
        expensesResult,
      ] = await Promise.allSettled([
        getCashToday(token),
        getSales(token),
        getDebts(token),
        getProducts(token),
        getExpenses(token),
      ]);

      if (cashResult.status === "fulfilled") {
        setBusinessDate(cashResult.value.businessDate);
        setCashSession(cashResult.value.session);
        setCashTotals(cashResult.value.totals);
        setLedger(cashResult.value.ledger);
      }

      if (salesResult.status === "fulfilled") {
        setSales(salesResult.value.sales);
      }

      if (debtsResult.status === "fulfilled") {
        setDebts(debtsResult.value.debts);
      }

      if (productsResult.status === "fulfilled") {
        setProducts(productsResult.value.products);
      }

      if (expensesResult.status === "fulfilled") {
        setExpenses(expensesResult.value.expenses);
      }

      const failed = [
        cashResult,
        salesResult,
        debtsResult,
        productsResult,
        expensesResult,
      ].filter((result) => result.status === "rejected");

      if (failed.length > 0) {
        setMessage(
          "Some dashboard sections could not load because this account may not have all permissions.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleMainAction() {
    if (isCashOpen) {
      router.push("/sales");
      return;
    }

    router.push("/cash");
  }

  function goToSellingOrCash() {
    if (isCashOpen) {
      router.push("/sales");
      return;
    }

    router.push("/cash");
  }

  function goToDebtPaymentOrCash() {
    if (isCashOpen) {
      router.push("/debts");
      return;
    }

    router.push("/cash");
  }

  function goToExpenseOrCash() {
    if (isCashOpen) {
      router.push("/expenses");
      return;
    }

    router.push("/cash");
  }

  return (
    <AppShell title="Dashboard">
      <section className="dashboard-hero">
        <div>
          <span className="hero-kicker dashboard-kicker">
            <ShieldCheck size={15} />
            Owner command center
          </span>

          <h1>Today in the shop</h1>

          <p>
            Simple control for money, stock, customer debts, expenses, and daily
            shop problems.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleMainAction}
          >
            {mainActionLabel}
            <ArrowRight size={14} />
          </button>

          <button
            className="btn btn-outline"
            type="button"
            onClick={() => router.push("/cash")}
          >
            Cash
          </button>

          <button
            className="btn btn-outline"
            type="button"
            onClick={loadDashboard}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </section>

      {message ? (
        <div
          className="table-card premium-panel"
          style={{
            marginBottom: 18,
            padding: 16,
            fontWeight: 900,
            color: "var(--gray-700)",
          }}
        >
          {message}
        </div>
      ) : null}

      <section
        className="table-card premium-panel"
        style={{
          marginBottom: 18,
          padding: 18,
          borderColor: isCashOpen
            ? "rgba(34, 197, 94, 0.28)"
            : "rgba(245, 158, 11, 0.35)",
          background: isCashOpen ? "var(--green-lt)" : "var(--gold-lt)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr repeat(4, minmax(0, 1fr))",
            gap: 14,
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="feature-icon" style={{ marginBottom: 0 }}>
              {isCashOpen ? (
                <CheckCircle2 size={21} />
              ) : (
                <AlertTriangle size={21} />
              )}
            </div>

            <div>
              <div
                style={{
                  color: "var(--gray-900)",
                  fontSize: 18,
                  fontWeight: 950,
                  letterSpacing: "-0.3px",
                }}
              >
                {shopStatusTitle}
              </div>

              <div
                style={{
                  marginTop: 5,
                  color: "var(--gray-600)",
                  fontSize: 13,
                  fontWeight: 800,
                  lineHeight: 1.45,
                }}
              >
                {shopStatusHelp}
              </div>
            </div>
          </div>

          <StatusMini label="Business date" value={businessDate} />
          <StatusMini label="Sales today" value={formatRwf(todaySalesTotal)} />
          <StatusMini
            label="Money in"
            value={formatRwf(cashTotals.moneyInRwf)}
          />
          <StatusMini
            label="Needs attention"
            value={String(problemCount)}
            danger={problemCount > 0}
          />
        </div>
      </section>

      <section
        className="table-card premium-panel"
        style={{ marginBottom: 18 }}
      >
        <div className="table-card-header">
          <div>
            <div className="table-title">Owner attention center</div>
            <div className="app-subtitle">
              Check these first before looking at reports.
            </div>
          </div>

          {loading ? (
            <Loader2
              className="spin"
              size={20}
              style={{ color: "var(--orange)" }}
            />
          ) : (
            <span
              className={
                problemCount > 0 ? "badge badge-orange" : "badge badge-green"
              }
            >
              {problemCount > 0
                ? `${problemCount} issue(s)`
                : "Everything clear"}
            </span>
          )}
        </div>

        <div className="attention-list">
          {!isCashOpen ? (
            <div className="attention-item">
              <AlertTriangle size={17} />
              <div>
                <strong>Cash is not open</strong>
                <span>
                  Sales, debt payments, and paid expenses are blocked until cash
                  is opened or reopened.
                </span>
              </div>
            </div>
          ) : null}

          {overdueDebts.length > 0 ? (
            <div className="attention-item">
              <WalletCards size={17} />
              <div>
                <strong>{overdueDebts.length} overdue customer debt(s)</strong>
                <span>
                  Customers promised to pay but the expected payment time has
                  already passed.
                </span>
              </div>
            </div>
          ) : null}

          {debtsDueToday.length > 0 ? (
            <div className="attention-item">
              <CalendarClock size={17} />
              <div>
                <strong>
                  {debtsDueToday.length} customer payment(s) due today
                </strong>
                <span>Follow up before closing the day.</span>
              </div>
            </div>
          ) : null}

          {pendingExpenses.length > 0 ? (
            <div className="attention-item">
              <ReceiptText size={17} />
              <div>
                <strong>
                  {pendingExpenses.length} expense approval(s) waiting
                </strong>
                <span>
                  Total waiting approval: {formatRwf(pendingExpenseTotal)}.
                </span>
              </div>
            </div>
          ) : null}

          {lowStockProducts.length > 0 ? (
            <div className="attention-item">
              <Boxes size={17} />
              <div>
                <strong>{lowStockProducts.length} low-stock product(s)</strong>
                <span>
                  Check stock before customers ask for unavailable items.
                </span>
              </div>
            </div>
          ) : null}

          {hasCashDifference ? (
            <div className="attention-item">
              <Banknote size={17} />
              <div>
                <strong>Cash difference found</strong>
                <span>
                  Closing difference:{" "}
                  {formatRwf(cashSession?.differenceRwf || 0)}.
                </span>
              </div>
            </div>
          ) : null}

          {cashReopenedToday ? (
            <div className="attention-item">
              <Clock3 size={17} />
              <div>
                <strong>Cash was reopened today</strong>
                <span>
                  Review the cash proof and audit trail before closing.
                </span>
              </div>
            </div>
          ) : null}

          {problemCount === 0 && isCashOpen ? (
            <div className="attention-item">
              <CheckCircle2 size={17} />
              <div>
                <strong>No urgent problem found</strong>
                <span>
                  The shop looks clean right now. Keep selling and tracking.
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="premium-stats-grid">
        <PremiumMetric
          icon={<Banknote size={20} />}
          label="Money received"
          value={formatRwf(cashTotals.moneyInRwf)}
          help={`Cash ${formatRwf(cashTotals.cashInRwf)} · MoMo ${formatRwf(
            cashTotals.momoInRwf,
          )}`}
          badge="Today"
          badgeClass="badge badge-green"
        />

        <PremiumMetric
          icon={<ReceiptText size={20} />}
          label="Money spent"
          value={formatRwf(cashTotals.moneyOutRwf)}
          help={`${todayExpenses.length} approved expense(s) today`}
          badge="Out"
          badgeClass="badge badge-orange"
        />

        <PremiumMetric
          icon={<WalletCards size={20} />}
          label="Net money movement"
          value={formatRwf(netMoneyMovement)}
          help="Money received minus money spent"
          badge="Net"
          badgeClass={
            netMoneyMovement >= 0 ? "badge badge-green" : "badge badge-orange"
          }
        />

        <PremiumMetric
          icon={<Banknote size={20} />}
          label="Expected cash"
          value={formatRwf(cashTotals.expectedCashRwf)}
          help="Opening float + cash in - cash out"
          badge={cashSession?.status || "Not opened"}
          badgeClass={
            isCashOpen
              ? "badge badge-green"
              : isCashClosed
                ? "badge badge-blue"
                : "badge badge-orange"
          }
        />
      </div>

      <div className="premium-stats-grid" style={{ marginTop: 18 }}>
        <PremiumMetric
          icon={<ShoppingCart size={20} />}
          label="Today sales"
          value={formatRwf(todaySalesTotal)}
          help={`${todaySales.length} sale(s), ${formatRwf(todayPaidTotal)} paid`}
          badge="Sales"
          badgeClass="badge badge-green"
        />

        <PremiumMetric
          icon={<Users size={20} />}
          label="Open customer debts"
          value={formatRwf(openDebtTotal)}
          help={`${openDebts.length} customer(s) still owe money`}
          badge="Pay later"
          badgeClass="badge badge-orange"
        />

        <PremiumMetric
          icon={<Boxes size={20} />}
          label="Stock value"
          value={formatRwf(stockValue)}
          help={`${lowStockProducts.length} low-stock product(s)`}
          badge="Stock"
          badgeClass="badge badge-blue"
        />

        <PremiumMetric
          icon={<ReceiptText size={20} />}
          label="Pending expenses"
          value={formatRwf(pendingExpenseTotal)}
          help={`${pendingExpenses.length} waiting owner review`}
          badge="Approval"
          badgeClass={
            pendingExpenses.length > 0
              ? "badge badge-orange"
              : "badge badge-green"
          }
        />
      </div>

      <div className="dashboard-grid">
        <section className="table-card premium-panel">
          <div className="table-card-header">
            <div>
              <div className="table-title">Quick actions</div>
              <div className="app-subtitle">
                The next action should always be obvious.
              </div>
            </div>
          </div>

          <div className="quick-actions-grid">
            <button
              className="quick-action"
              type="button"
              onClick={goToSellingOrCash}
            >
              <Banknote size={18} />
              <span>{isCashOpen ? "Sell product" : "Open cash first"}</span>
              <small>
                {isCashOpen
                  ? "Paid now, pay later, or installments"
                  : "Selling is blocked until cash opens"}
              </small>
            </button>

            <button
              className="quick-action"
              type="button"
              onClick={() => router.push("/inventory")}
            >
              <Boxes size={18} />
              <span>Add stock</span>
              <small>New arrivals and damaged items</small>
            </button>

            <button
              className="quick-action"
              type="button"
              onClick={goToDebtPaymentOrCash}
            >
              <Users size={18} />
              <span>{isCashOpen ? "Record payment" : "Open cash first"}</span>
              <small>
                {isCashOpen
                  ? "Customer pays debt or installment"
                  : "Payments are blocked until cash opens"}
              </small>
            </button>

            <button
              className="quick-action"
              type="button"
              onClick={goToExpenseOrCash}
            >
              <ReceiptText size={18} />
              <span>{isCashOpen ? "Record expense" : "Open cash first"}</span>
              <small>
                {isCashOpen
                  ? "Money out with proof"
                  : "Expenses are blocked until cash opens"}
              </small>
            </button>
          </div>
        </section>

        <section className="table-card premium-panel">
          <div className="table-card-header">
            <div>
              <div className="table-title">Payment method breakdown</div>
              <div className="app-subtitle">
                Simple view of how money entered the shop.
              </div>
            </div>
          </div>

          <div className="attention-list">
            <BreakdownRow
              label="Cash"
              valueIn={cashTotals.cashInRwf}
              valueOut={cashTotals.cashOutRwf}
            />
            <BreakdownRow
              label="MoMo"
              valueIn={cashTotals.momoInRwf}
              valueOut={cashTotals.momoOutRwf}
            />
            <BreakdownRow
              label="Bank"
              valueIn={cashTotals.bankInRwf}
              valueOut={cashTotals.bankOutRwf}
            />
            <BreakdownRow
              label="Card / Other"
              valueIn={cashTotals.cardInRwf + cashTotals.otherInRwf}
              valueOut={cashTotals.cardOutRwf + cashTotals.otherOutRwf}
            />
          </div>
        </section>
      </div>

      <div className="dashboard-grid" style={{ marginTop: 18 }}>
        <ActivityPanel
          title="Latest sales"
          subtitle="Recent products sold."
          emptyTitle="No sales yet"
          emptyText="Sales will appear here after selling starts."
        >
          {latestSales.map((sale) => (
            <div key={sale.id} className="attention-item">
              <ShoppingCart size={17} />
              <div>
                <strong>{sale.saleNumber}</strong>
                <span>
                  {sale.customerName || sale.walkInName || "Walk-in customer"} ·{" "}
                  {formatRwf(sale.totalAmountRwf)}
                </span>
                <span>
                  Paid: {formatRwf(sale.amountPaidRwf)} · Balance:{" "}
                  {formatRwf(sale.balanceRwf)}
                </span>
              </div>
            </div>
          ))}
        </ActivityPanel>

        <ActivityPanel
          title="Open debts"
          subtitle="Customers who still owe money."
          emptyTitle="No open debts"
          emptyText="No customer debt is currently open."
        >
          {topOpenDebts.map((debt) => (
            <div key={debt.id} className="attention-item">
              <WalletCards size={17} />
              <div>
                <strong>{debt.customerName}</strong>
                <span>
                  Balance: {formatRwf(debt.balanceRwf)} · Sale:{" "}
                  {debt.saleNumber || "No sale number"}
                </span>
                <span>Expected: {formatDate(debt.expectedPaymentAt)}</span>
              </div>
            </div>
          ))}
        </ActivityPanel>
      </div>

      <div className="dashboard-grid" style={{ marginTop: 18 }}>
        <ActivityPanel
          title="Latest expenses"
          subtitle="Recent shop costs and approvals."
          emptyTitle="No expenses yet"
          emptyText="Expenses will appear here after recording costs."
        >
          {latestExpenses.map((expense) => (
            <div key={expense.id} className="attention-item">
              <ReceiptText size={17} />
              <div>
                <strong>
                  {expense.expenseNumber} · {expense.title}
                </strong>
                <span>
                  {expense.categoryNameSnapshot} ·{" "}
                  {formatRwf(expense.amountRwf)} · {expense.method}
                </span>
                <span>Status: {expense.status}</span>
              </div>
            </div>
          ))}
        </ActivityPanel>

        <ActivityPanel
          title="Latest money proof"
          subtitle="Recent money movement records."
          emptyTitle="No money movement"
          emptyText="Money proof appears after sales, payments, expenses, or cash actions."
        >
          {latestLedger.map((entry) => (
            <div key={entry.id} className="attention-item">
              <Banknote size={17} />
              <div>
                <strong>
                  {entry.direction === "money_in"
                    ? "Money received"
                    : entry.direction === "money_out"
                      ? "Money spent"
                      : "Cash note"}{" "}
                  · {formatRwf(entry.amountRwf)}
                </strong>
                <span>
                  {entry.category} · {entry.method} ·{" "}
                  {formatDate(entry.happenedAt)}
                </span>
                <span>{entry.description || "No description"}</span>
              </div>
            </div>
          ))}
        </ActivityPanel>
      </div>
    </AppShell>
  );
}

type PremiumMetricProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  help: string;
  badge: string;
  badgeClass: string;
};

function PremiumMetric({
  icon,
  label,
  value,
  help,
  badge,
  badgeClass,
}: PremiumMetricProps) {
  return (
    <div className="premium-stat-card">
      <div className="stat-card-top">
        <div className="feature-icon">{icon}</div>
        <span className={badgeClass}>{badge}</span>
      </div>

      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: 24 }}>
        {value}
      </div>
      <div className="stat-help">{help}</div>
    </div>
  );
}

type StatusMiniProps = {
  label: string;
  value: string;
  danger?: boolean;
};

function StatusMini({ label, value, danger = false }: StatusMiniProps) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--card)",
        borderRadius: 16,
        padding: 12,
      }}
    >
      <div
        style={{
          color: "var(--gray-500)",
          fontSize: 11,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.4px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 6,
          color: danger ? "var(--red)" : "var(--gray-900)",
          fontSize: 17,
          fontWeight: 950,
          letterSpacing: "-0.2px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

type BreakdownRowProps = {
  label: string;
  valueIn: number;
  valueOut: number;
};

function BreakdownRow({ label, valueIn, valueOut }: BreakdownRowProps) {
  return (
    <div className="attention-item">
      <Banknote size={17} />
      <div>
        <strong>{label}</strong>
        <span>
          Received: {formatRwf(valueIn)} · Spent: {formatRwf(valueOut)}
        </span>
      </div>
    </div>
  );
}

type ActivityPanelProps = {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyText: string;
  children: React.ReactNode;
};

function ActivityPanel({
  title,
  subtitle,
  emptyTitle,
  emptyText,
  children,
}: ActivityPanelProps) {
  const hasChildren = Array.isArray(children)
    ? children.filter(Boolean).length > 0
    : Boolean(children);

  return (
    <section className="table-card premium-panel">
      <div className="table-card-header">
        <div>
          <div className="table-title">{title}</div>
          <div className="app-subtitle">{subtitle}</div>
        </div>
      </div>

      <div className="attention-list">
        {hasChildren ? (
          children
        ) : (
          <div className="attention-item">
            <ShieldCheck size={17} />
            <div>
              <strong>{emptyTitle}</strong>
              <span>{emptyText}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
