"use client";

import {
  AlertTriangle,
  Banknote,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";
import { AuthUser, getCurrentUser, getToken } from "@/lib/auth";
import {
  DailySummaryReport,
  downloadDailySummaryPdf,
  getDailySummaryReport,
} from "@/lib/reports";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import styles from "./page.module.css";

function formatRwf(value: number) {
  return `Rwf ${Number(value || 0).toLocaleString("en-US")}`;
}

function formatPercent(value: number) {
  return `${Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 1,
  })}%`;
}

function formatDate(value: string | null) {
  if (!value) return "Not set";

  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTodayDate() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function hasPermission(user: AuthUser | null, permission: string) {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (user.permissions.includes("*")) return true;
  return user.permissions.includes(permission);
}

function readableDirection(value: string) {
  if (value === "money_in") return "Money in";
  if (value === "money_out") return "Money out";
  return value.replaceAll("_", " ");
}

function readableMethod(value: string) {
  if (value === "momo") return "MoMo";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function reportHasDownloadableData(report: DailySummaryReport | null) {
  if (!report) return false;

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

function saveBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();

  window.URL.revokeObjectURL(url);
  anchor.remove();
}

export default function ReportsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [date, setDate] = useState(getTodayDate());
  const [report, setReport] = useState<DailySummaryReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState("");

  const canViewReports = hasPermission(user, "reports.view");
  const hasDownloadableData = reportHasDownloadableData(report);

  const shopHealth = useMemo(() => {
    if (!report) {
      return {
        label: "Waiting",
        className: "badge badge-blue",
        text: "Load a report to see shop status.",
      };
    }

    const cashDifference = Math.abs(report.cashSession?.differenceRwf || 0);

    const problems =
      report.summary.overdueDebtCount +
      report.summary.zeroStockCount +
      report.summary.pendingExpensesCount +
      (cashDifference > 0 ? 1 : 0) +
      (report.summary.netProfitRwf < 0 ? 1 : 0);

    if (problems > 0) {
      return {
        label: "Needs attention",
        className: "badge badge-orange",
        text: `${problems} issue(s) need owner review before closing this business day.`,
      };
    }

    return {
      label: "Clean",
      className: "badge badge-green",
      text: "Profit, cash, stock, debts, and approvals look clean for this report.",
    };
  }, [report]);

  const profitBadgeClass =
    report && report.summary.netProfitRwf >= 0
      ? "badge badge-green"
      : "badge badge-orange";

  const grossProfitBadgeClass =
    report && report.summary.grossProfitRwf >= 0
      ? "badge badge-green"
      : "badge badge-orange";

  const cashFlowBadgeClass =
    report && report.summary.netMoneyMovementRwf >= 0
      ? "badge badge-green"
      : "badge badge-orange";

  useEffect(() => {
    loadReport(date);
  }, []);

  async function loadReport(nextDate = date) {
    const token = getToken();

    if (!token) {
      setMessage("You are not logged in.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const meResponse = await getCurrentUser(token);
      setUser(meResponse.user);

      const reportResponse = await getDailySummaryReport(token, nextDate);

      setReport(reportResponse.report);
      setDate(reportResponse.report.businessDate);
    } catch (error) {
      setReport(null);
      setMessage(
        error instanceof Error ? error.message : "Could not load report.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadReport(date);
  }

  async function handleDownloadPdf() {
    const token = getToken();

    if (!token) {
      setMessage("You are not logged in.");
      return;
    }

    if (!reportHasDownloadableData(report)) {
      setMessage(
        "No report PDF is available for this date because there is no shop data to download.",
      );
      return;
    }

    setDownloading(true);
    setMessage("");

    try {
      const file = await downloadDailySummaryPdf(token, date);

      saveBlob(file.blob, file.filename);
      setMessage("PDF report downloaded successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not download PDF.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <AppShell title="Reports">
      <div className={styles.reportsPage}>
        <section className={`dashboard-hero ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className="hero-kicker dashboard-kicker">
              <FileText size={15} />
              Owner financial command center
            </span>

            <h1>Reports</h1>

            <p>
              See profit, loss, money movement, cash proof, debts, expenses, and
              stock risk from one clean daily control report.
            </p>
          </div>

          <div className={`dashboard-hero-actions ${styles.heroActions}`}>
            <form onSubmit={handleFilter} className={styles.dateForm}>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />

              <button className="btn btn-outline" type="submit">
                <RefreshCw size={14} />
                Load report
              </button>
            </form>

            <AsyncButton
              loading={downloading}
              type="button"
              onClick={handleDownloadPdf}
              disabled={!report || !canViewReports || !hasDownloadableData}
            >
              <Download size={14} />
              Download PDF
            </AsyncButton>
          </div>
        </section>

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        {!canViewReports && user ? (
          <div className={styles.warningNotice}>
            <ShieldCheck size={20} />
            <div>
              <strong>No report access</strong>
              <span>
                You do not have permission to view or download reports.
              </span>
            </div>
          </div>
        ) : null}

        {!loading && report && !hasDownloadableData ? (
          <div className={styles.warningNotice}>
            <AlertTriangle size={20} />
            <div>
              <strong>No PDF available for this date</strong>
              <span>
                There is no shop data to download yet. Sales, cash, debts,
                expenses, or stock activity will make a report available.
              </span>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="loading-card">
            <Loader2 className="spin" size={18} />
            <div>
              <strong>Loading report...</strong>
              <p>Preparing owner financial summary for {date}.</p>
            </div>
          </div>
        ) : null}

        {!loading && report && canViewReports ? (
          <>
            <section
              className={
                shopHealth.label === "Clean"
                  ? styles.summaryCardClean
                  : styles.summaryCardWarning
              }
            >
              <div className={styles.summaryIntro}>
                <div className="feature-icon">
                  {shopHealth.label === "Clean" ? (
                    <CheckCircle2 size={21} />
                  ) : (
                    <AlertTriangle size={21} />
                  )}
                </div>

                <div>
                  <strong>{report.reportTitle}</strong>
                  <span>{shopHealth.text}</span>
                </div>
              </div>

              <div className={styles.statusGrid}>
                <StatusMini label="Business date" value={report.businessDate} />
                <StatusMini
                  label="Cash session"
                  value={report.cashSession?.status || "Not opened"}
                  danger={!report.cashSession}
                />
                <StatusMini
                  label="Net profit"
                  value={formatRwf(report.summary.netProfitRwf)}
                  danger={report.summary.netProfitRwf < 0}
                />
                <StatusMini
                  label="Report status"
                  value={shopHealth.label}
                  danger={shopHealth.label !== "Clean"}
                />
              </div>
            </section>

            <div className={styles.metricsGrid}>
              <ReportMetric
                icon={<WalletCards size={20} />}
                label="Net profit"
                value={formatRwf(report.summary.netProfitRwf)}
                help={`${formatPercent(
                  report.summary.profitMarginPercent,
                )} profit margin`}
                badge={report.summary.netProfitRwf >= 0 ? "Profit" : "Loss"}
                badgeClass={profitBadgeClass}
              />

              <ReportMetric
                icon={<Banknote size={20} />}
                label="Gross profit"
                value={formatRwf(report.summary.grossProfitRwf)}
                help="Sales minus estimated inventory cost"
                badge="Gross"
                badgeClass={grossProfitBadgeClass}
              />

              <ReportMetric
                icon={<ShoppingCart size={20} />}
                label="Revenue"
                value={formatRwf(report.summary.totalSalesRwf)}
                help={`${report.summary.salesCount} sale(s) recorded`}
                badge="Sales"
                badgeClass="badge badge-green"
              />

              <ReportMetric
                icon={<ReceiptText size={20} />}
                label="Approved expenses"
                value={formatRwf(report.summary.approvedExpensesRwf)}
                help={`${report.summary.approvedExpensesCount} approved expense(s)`}
                badge="Expense"
                badgeClass="badge badge-orange"
              />

              <ReportMetric
                icon={<Boxes size={20} />}
                label="Cost of goods sold"
                value={formatRwf(report.summary.estimatedCogsRwf)}
                help="Estimated product cost sold today"
                badge="COGS"
                badgeClass="badge badge-blue"
              />

              <ReportMetric
                icon={<Banknote size={20} />}
                label="Money received"
                value={formatRwf(report.summary.moneyInRwf)}
                help={`Paid on sales: ${formatRwf(
                  report.summary.amountPaidOnSalesRwf,
                )}`}
                badge="Cash in"
                badgeClass="badge badge-green"
              />

              <ReportMetric
                icon={<ReceiptText size={20} />}
                label="Money spent"
                value={formatRwf(report.summary.moneyOutRwf)}
                help="All approved money-out movement"
                badge="Cash out"
                badgeClass="badge badge-orange"
              />

              <ReportMetric
                icon={<WalletCards size={20} />}
                label="Net cash flow"
                value={formatRwf(report.summary.netMoneyMovementRwf)}
                help="Cash in minus cash out, not the same as profit"
                badge="Flow"
                badgeClass={cashFlowBadgeClass}
              />

              <ReportMetric
                icon={<Users size={20} />}
                label="Open customer debt"
                value={formatRwf(report.summary.openCustomerDebtRwf)}
                help={`${report.summary.overdueDebtCount} overdue debt(s)`}
                badge="Debts"
                badgeClass={
                  report.summary.openCustomerDebtRwf > 0
                    ? "badge badge-orange"
                    : "badge badge-green"
                }
              />

              <ReportMetric
                icon={<ReceiptText size={20} />}
                label="Pending expenses"
                value={formatRwf(report.summary.pendingExpensesRwf)}
                help={`${report.summary.pendingExpensesCount} waiting owner review`}
                badge="Approval"
                badgeClass={
                  report.summary.pendingExpensesCount > 0
                    ? "badge badge-orange"
                    : "badge badge-green"
                }
              />

              <ReportMetric
                icon={<Boxes size={20} />}
                label="Stock value"
                value={formatRwf(report.summary.stockValueRwf)}
                help={`${report.summary.lowStockCount} low-stock product(s)`}
                badge="Stock"
                badgeClass="badge badge-blue"
              />

              <ReportMetric
                icon={<Boxes size={20} />}
                label="Zero stock"
                value={String(report.summary.zeroStockCount)}
                help="Products with no available stock"
                badge="Empty"
                badgeClass={
                  report.summary.zeroStockCount > 0
                    ? "badge badge-orange"
                    : "badge badge-green"
                }
              />
            </div>

            <div className={styles.reportGrid}>
              <section className={styles.panel}>
                <PanelHeader
                  title="Profit and loss"
                  subtitle="Real business performance, not just money movement."
                  badge={
                    report.summary.netProfitRwf >= 0
                      ? "Profitable"
                      : "Loss making"
                  }
                  badgeClass={profitBadgeClass}
                />

                <div className={styles.proofList}>
                  <ProofRow
                    icon={<ShoppingCart size={17} />}
                    title="Revenue"
                    text={formatRwf(report.summary.totalSalesRwf)}
                  />
                  <ProofRow
                    icon={<Boxes size={17} />}
                    title="Estimated cost of goods sold"
                    text={formatRwf(report.summary.estimatedCogsRwf)}
                  />
                  <ProofRow
                    icon={<Banknote size={17} />}
                    title="Gross profit"
                    text={formatRwf(report.summary.grossProfitRwf)}
                  />
                  <ProofRow
                    icon={<ReceiptText size={17} />}
                    title="Approved expenses"
                    text={formatRwf(report.summary.approvedExpensesRwf)}
                  />
                  <ProofRow
                    icon={<WalletCards size={17} />}
                    title="Net profit / loss"
                    text={`${formatRwf(
                      report.summary.netProfitRwf,
                    )} · ${formatPercent(report.summary.profitMarginPercent)}`}
                  />
                </div>
              </section>

              <section className={styles.panel}>
                <PanelHeader
                  title="Money flow"
                  subtitle="Cash in and cash out across every payment method."
                  badge={
                    report.summary.netMoneyMovementRwf >= 0
                      ? "Positive flow"
                      : "Negative flow"
                  }
                  badgeClass={cashFlowBadgeClass}
                />

                <div className={styles.proofList}>
                  <ProofRow
                    icon={<Banknote size={17} />}
                    title="Total money in"
                    text={formatRwf(report.summary.moneyInRwf)}
                  />
                  <ProofRow
                    icon={<ReceiptText size={17} />}
                    title="Total money out"
                    text={formatRwf(report.summary.moneyOutRwf)}
                  />
                  <ProofRow
                    icon={<WalletCards size={17} />}
                    title="Net cash flow"
                    text={formatRwf(report.summary.netMoneyMovementRwf)}
                  />
                  <ProofRow
                    icon={<Users size={17} />}
                    title="Debt collected"
                    text={formatRwf(report.summary.debtPaymentsReceivedRwf)}
                  />
                  <ProofRow
                    icon={<Users size={17} />}
                    title="New customer debt"
                    text={formatRwf(report.summary.newCustomerDebtRwf)}
                  />
                </div>
              </section>
            </div>

            <div className={styles.reportGrid}>
              <section className={styles.panel}>
                <PanelHeader
                  title="Cash session proof"
                  subtitle="Drawer control for this business date."
                  badge={report.cashSession?.status || "Not opened"}
                  badgeClass={
                    report.cashSession?.status === "open"
                      ? "badge badge-green"
                      : report.cashSession?.status === "closed"
                        ? "badge badge-blue"
                        : "badge badge-orange"
                  }
                />

                <div className={styles.proofList}>
                  <ProofRow
                    icon={<CalendarDays size={17} />}
                    title="Business date"
                    text={report.businessDate}
                  />
                  <ProofRow
                    icon={<Banknote size={17} />}
                    title="Opening float"
                    text={formatRwf(report.cashSession?.openingFloatRwf || 0)}
                  />
                  <ProofRow
                    icon={<WalletCards size={17} />}
                    title="Expected cash"
                    text={formatRwf(report.cashSession?.expectedCashRwf || 0)}
                  />
                  <ProofRow
                    icon={<Banknote size={17} />}
                    title="Counted cash"
                    text={
                      report.cashSession?.countedCashRwf === null ||
                      report.cashSession?.countedCashRwf === undefined
                        ? "Not counted"
                        : formatRwf(report.cashSession.countedCashRwf)
                    }
                  />
                  <ProofRow
                    icon={<AlertTriangle size={17} />}
                    title="Cash difference"
                    text={formatRwf(report.cashSession?.differenceRwf || 0)}
                  />
                  <ProofRow
                    icon={<Clock3 size={17} />}
                    title="Closed at"
                    text={formatDate(report.cashSession?.closedAt || null)}
                  />
                </div>
              </section>

              <section className={styles.panel}>
                <PanelHeader
                  title="Business wallets"
                  subtitle="Money distribution by payment method."
                  badge="Payment methods"
                  badgeClass="badge badge-blue"
                />

                <div className={styles.proofList}>
                  <MethodRow
                    label="Cash"
                    moneyIn={report.methodTotals.moneyIn.cash}
                    moneyOut={report.methodTotals.moneyOut.cash}
                  />
                  <MethodRow
                    label="MoMo"
                    moneyIn={report.methodTotals.moneyIn.momo}
                    moneyOut={report.methodTotals.moneyOut.momo}
                  />
                  <MethodRow
                    label="Bank"
                    moneyIn={report.methodTotals.moneyIn.bank}
                    moneyOut={report.methodTotals.moneyOut.bank}
                  />
                  <MethodRow
                    label="Card"
                    moneyIn={report.methodTotals.moneyIn.card}
                    moneyOut={report.methodTotals.moneyOut.card}
                  />
                  <MethodRow
                    label="Other"
                    moneyIn={report.methodTotals.moneyIn.other}
                    moneyOut={report.methodTotals.moneyOut.other}
                  />
                </div>
              </section>
            </div>

            <div className={styles.reportGrid}>
              <ReportListPanel
                title="Sales proof"
                subtitle="Latest sales included in this report."
                emptyTitle="No sales recorded"
                emptyText="Sales will appear here when the shop sells products."
              >
                {report.salesRows.slice(0, 5).map((sale) => (
                  <ReportItem
                    key={sale.saleNumber}
                    icon={<ShoppingCart size={17} />}
                    title={sale.saleNumber}
                    lines={[
                      `${sale.customerName} · ${formatRwf(sale.totalAmountRwf)}`,
                      `Paid: ${formatRwf(sale.amountPaidRwf)} · Balance: ${formatRwf(
                        sale.balanceRwf,
                      )}`,
                      `Status: ${sale.paymentStatus} · Sold by: ${sale.soldByName}`,
                    ]}
                  />
                ))}
              </ReportListPanel>

              <ReportListPanel
                title="Expense proof"
                subtitle="Approved money-out records for this date."
                emptyTitle="No approved expenses"
                emptyText="Expenses will appear here after approval."
              >
                {report.expenseRows.slice(0, 5).map((expense) => (
                  <ReportItem
                    key={expense.expenseNumber}
                    icon={<ReceiptText size={17} />}
                    title={expense.expenseNumber}
                    lines={[
                      `${expense.title} · ${formatRwf(expense.amountRwf)}`,
                      `${expense.category} · ${readableMethod(
                        expense.method,
                      )} · ${expense.status}`,
                      `Created by: ${expense.createdByName} · Paid: ${formatDate(
                        expense.paidAt,
                      )}`,
                    ]}
                  />
                ))}
              </ReportListPanel>
            </div>

            <div className={styles.reportGrid}>
              <ReportListPanel
                title="Customer debt risk"
                subtitle="Customers who still owe the business money."
                emptyTitle="No open customer debt"
                emptyText="Open debts will appear here."
              >
                {report.debtRows.slice(0, 5).map((debt) => (
                  <ReportItem
                    key={`${debt.customerName}-${debt.saleNumber}`}
                    icon={<WalletCards size={17} />}
                    title={debt.customerName}
                    lines={[
                      `Balance: ${formatRwf(debt.balanceRwf)} · Sale: ${
                        debt.saleNumber
                      }`,
                      `Phone: ${debt.customerPhone || "Not set"} · Status: ${
                        debt.status
                      }`,
                      `Expected: ${formatDate(debt.expectedPaymentAt)}`,
                    ]}
                  />
                ))}
              </ReportListPanel>

              <ReportListPanel
                title="Stock risk"
                subtitle="Products that need owner attention."
                emptyTitle="No low-stock product"
                emptyText="Low-stock products will appear here."
              >
                {report.lowStockRows.slice(0, 5).map((product) => (
                  <ReportItem
                    key={product.sku}
                    icon={<Boxes size={17} />}
                    title={product.name}
                    lines={[
                      `SKU: ${product.sku} · Stock: ${product.currentStock}`,
                      `Alert at ${product.lowStockAlert} · Selling price ${formatRwf(
                        product.sellingPriceRwf,
                      )}`,
                    ]}
                  />
                ))}
              </ReportListPanel>
            </div>

            <section className={styles.panel}>
              <PanelHeader
                title="Money movement timeline"
                subtitle="Chronological flow of money in and out of the business."
                badge={`${report.moneyRows.length} record(s)`}
                badgeClass="badge badge-blue"
              />

              <div className={styles.ledgerList}>
                {report.moneyRows.slice(0, 10).map((entry, index) => (
                  <article
                    key={`${entry.time}-${entry.category}-${index}`}
                    className={styles.ledgerCard}
                  >
                    <div className={styles.ledgerTop}>
                      <div>
                        <strong>{formatRwf(entry.amountRwf)}</strong>
                        <span>{formatDate(entry.time)}</span>
                      </div>

                      <span
                        className={
                          entry.direction === "money_in"
                            ? "badge badge-green"
                            : entry.direction === "money_out"
                              ? "badge badge-orange"
                              : "badge badge-blue"
                        }
                      >
                        {readableDirection(entry.direction)}
                      </span>
                    </div>

                    <div className={styles.ledgerDetails}>
                      <LedgerDetail
                        label="Method"
                        value={readableMethod(entry.method)}
                      />
                      <LedgerDetail label="Category" value={entry.category} />
                      <LedgerDetail label="Actor" value={entry.actorName} />
                    </div>

                    {entry.description ? (
                      <div className={styles.proofList}>
                        <ProofRow
                          icon={<FileText size={17} />}
                          title="Description"
                          text={entry.description}
                        />
                      </div>
                    ) : null}
                  </article>
                ))}

                {report.moneyRows.length === 0 ? (
                  <div className={styles.emptyCard}>
                    <ShieldCheck size={18} />
                    <div>
                      <strong>No money movement found</strong>
                      <span>
                        No money entered or left the shop for this date.
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {hasDownloadableData ? (
              <section className={styles.downloadReady}>
                <ShieldCheck size={20} />
                <div>
                  <strong>Downloadable PDF proof is ready</strong>
                  <p>
                    The PDF is generated from saved database records. Use it as
                    the daily proof file for sales, profit, expenses, debts,
                    stock, and cash movement.
                  </p>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

type PanelHeaderProps = {
  title: string;
  subtitle: string;
  badge?: string;
  badgeClass?: string;
};

function PanelHeader({
  title,
  subtitle,
  badge,
  badgeClass = "badge badge-blue",
}: PanelHeaderProps) {
  return (
    <div className={styles.panelHeader}>
      <div>
        <div className="table-title">{title}</div>
        <div className="app-subtitle">{subtitle}</div>
      </div>

      {badge ? <span className={badgeClass}>{badge}</span> : null}
    </div>
  );
}

type ReportMetricProps = {
  icon: ReactNode;
  label: string;
  value: string;
  help: string;
  badge: string;
  badgeClass: string;
};

function ReportMetric({
  icon,
  label,
  value,
  help,
  badge,
  badgeClass,
}: ReportMetricProps) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricTop}>
        <div className="feature-icon">{icon}</div>
        <span className={badgeClass}>{badge}</span>
      </div>

      <div className="stat-label">{label}</div>
      <div className={styles.metricValue}>{value}</div>
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
    <div className={styles.statusMini}>
      <span>{label}</span>
      <strong className={danger ? styles.dangerValue : ""}>{value}</strong>
    </div>
  );
}

type ProofRowProps = {
  icon: ReactNode;
  title: string;
  text: string;
};

function ProofRow({ icon, title, text }: ProofRowProps) {
  return (
    <div className={styles.proofRow}>
      <div className={styles.rowIcon}>{icon}</div>
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

type MethodRowProps = {
  label: string;
  moneyIn: number;
  moneyOut: number;
};

function MethodRow({ label, moneyIn, moneyOut }: MethodRowProps) {
  const net = Number(moneyIn || 0) - Number(moneyOut || 0);

  return (
    <div className={styles.proofRow}>
      <div className={styles.rowIcon}>
        <Banknote size={17} />
      </div>
      <div>
        <strong>{label}</strong>
        <span>
          Received: {formatRwf(moneyIn)} · Spent: {formatRwf(moneyOut)} · Net:{" "}
          {formatRwf(net)}
        </span>
      </div>
    </div>
  );
}

type ReportItemProps = {
  icon: ReactNode;
  title: string;
  lines: string[];
};

function ReportItem({ icon, title, lines }: ReportItemProps) {
  return (
    <article className={styles.reportItem}>
      <div className={styles.rowIcon}>{icon}</div>

      <div>
        <strong>{title}</strong>
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </article>
  );
}

type ReportListPanelProps = {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyText: string;
  children: ReactNode;
};

function ReportListPanel({
  title,
  subtitle,
  emptyTitle,
  emptyText,
  children,
}: ReportListPanelProps) {
  const hasChildren = Array.isArray(children)
    ? children.filter(Boolean).length > 0
    : Boolean(children);

  return (
    <section className={styles.panel}>
      <PanelHeader title={title} subtitle={subtitle} />

      <div className={styles.listBody}>
        {hasChildren ? (
          children
        ) : (
          <div className={styles.emptyCard}>
            <ShieldCheck size={18} />
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

type LedgerDetailProps = {
  label: string;
  value: string;
};

function LedgerDetail({ label, value }: LedgerDetailProps) {
  return (
    <div className={styles.ledgerDetail}>
      <span>{label}</span>
      <strong>{value || "Not set"}</strong>
    </div>
  );
}
