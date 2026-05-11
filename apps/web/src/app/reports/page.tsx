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
import { FormEvent, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";

function formatRwf(value: number) {
  return `Rwf ${Number(value || 0).toLocaleString("en-US")}`;
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

    const problems =
      report.summary.overdueDebtCount +
      report.summary.lowStockCount +
      report.summary.pendingExpensesCount +
      (report.cashSession?.differenceRwf ? 1 : 0);

    if (problems > 0) {
      return {
        label: "Needs attention",
        className: "badge badge-orange",
        text: `${problems} issue(s) need owner review.`,
      };
    }

    return {
      label: "Clean",
      className: "badge badge-green",
      text: "No major issue found in this report.",
    };
  }, [report]);

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
      <section className="dashboard-hero">
        <div>
          <span className="hero-kicker dashboard-kicker">
            <FileText size={15} />
            Shop proof reports
          </span>

          <h1>Reports</h1>

          <p>
            View daily shop performance and download professional PDF proof
            files for sales, cash, debts, expenses, and stock.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <form
            onSubmit={handleFilter}
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              style={{
                height: 40,
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--card)",
                color: "var(--gray-900)",
                padding: "0 12px",
                fontWeight: 800,
              }}
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

      {!canViewReports && user ? (
        <div
          className="table-card premium-panel"
          style={{
            marginBottom: 18,
            padding: 16,
            borderColor: "rgba(245, 158, 11, 0.35)",
            background: "var(--gold-lt)",
            color: "var(--gray-900)",
            fontWeight: 800,
          }}
        >
          You do not have permission to view or download reports.
        </div>
      ) : null}

      {!loading && report && !hasDownloadableData ? (
        <div
          className="table-card premium-panel"
          style={{
            marginBottom: 18,
            padding: 16,
            borderColor: "rgba(245, 158, 11, 0.35)",
            background: "var(--gold-lt)",
            color: "var(--gray-900)",
            fontWeight: 800,
          }}
        >
          No report PDF is available for this date because there is no shop data
          to download.
        </div>
      ) : null}

      {loading ? (
        <div className="loading-card">
          <Loader2 className="spin" size={18} />
          <div>
            <strong>Loading report...</strong>
            <p>Preparing shop summary for {date}.</p>
          </div>
        </div>
      ) : null}

      {!loading && report ? (
        <>
          <section
            className="table-card premium-panel"
            style={{
              marginBottom: 18,
              padding: 18,
              borderColor:
                shopHealth.label === "Clean"
                  ? "rgba(34, 197, 94, 0.28)"
                  : "rgba(245, 158, 11, 0.35)",
              background:
                shopHealth.label === "Clean"
                  ? "var(--green-lt)"
                  : "var(--gold-lt)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr repeat(3, minmax(0, 1fr))",
                gap: 14,
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div className="feature-icon" style={{ marginBottom: 0 }}>
                  {shopHealth.label === "Clean" ? (
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
                    {report.reportTitle}
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
                    {shopHealth.text}
                  </div>
                </div>
              </div>

              <StatusMini label="Business date" value={report.businessDate} />
              <StatusMini
                label="Cash session"
                value={report.cashSession?.status || "Not opened"}
              />
              <StatusMini
                label="Report status"
                value={shopHealth.label}
                danger={shopHealth.label !== "Clean"}
              />
            </div>
          </section>

          <div className="premium-stats-grid">
            <ReportMetric
              icon={<ShoppingCart size={20} />}
              label="Total sales"
              value={formatRwf(report.summary.totalSalesRwf)}
              help={`${report.summary.salesCount} sale(s) recorded`}
              badge="Sales"
              badgeClass="badge badge-green"
            />

            <ReportMetric
              icon={<Banknote size={20} />}
              label="Money received"
              value={formatRwf(report.summary.moneyInRwf)}
              help={`Paid on sales: ${formatRwf(
                report.summary.amountPaidOnSalesRwf,
              )}`}
              badge="Money in"
              badgeClass="badge badge-green"
            />

            <ReportMetric
              icon={<ReceiptText size={20} />}
              label="Money spent"
              value={formatRwf(report.summary.moneyOutRwf)}
              help={`${report.summary.approvedExpensesCount} approved expense(s)`}
              badge="Money out"
              badgeClass="badge badge-orange"
            />

            <ReportMetric
              icon={<WalletCards size={20} />}
              label="Net movement"
              value={formatRwf(report.summary.netMoneyMovementRwf)}
              help="Money received minus money spent"
              badge="Net"
              badgeClass={
                report.summary.netMoneyMovementRwf >= 0
                  ? "badge badge-green"
                  : "badge badge-orange"
              }
            />
          </div>

          <div className="premium-stats-grid" style={{ marginTop: 18 }}>
            <ReportMetric
              icon={<Users size={20} />}
              label="Open customer debt"
              value={formatRwf(report.summary.openCustomerDebtRwf)}
              help={`${report.summary.overdueDebtCount} overdue debt(s)`}
              badge="Debts"
              badgeClass="badge badge-orange"
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

          <div className="dashboard-grid">
            <section className="table-card premium-panel">
              <div className="table-card-header">
                <div>
                  <div className="table-title">Cash session proof</div>
                  <div className="app-subtitle">
                    Drawer control for this business date.
                  </div>
                </div>

                <span
                  className={
                    report.cashSession?.status === "open"
                      ? "badge badge-green"
                      : report.cashSession?.status === "closed"
                        ? "badge badge-blue"
                        : "badge badge-orange"
                  }
                >
                  {report.cashSession?.status || "Not opened"}
                </span>
              </div>

              <div className="attention-list">
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
                  icon={<Clock3 size={17} />}
                  title="Closed at"
                  text={formatDate(report.cashSession?.closedAt || null)}
                />
              </div>
            </section>

            <section className="table-card premium-panel">
              <div className="table-card-header">
                <div>
                  <div className="table-title">Payment method breakdown</div>
                  <div className="app-subtitle">
                    How money entered and left the shop.
                  </div>
                </div>
              </div>

              <div className="attention-list">
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
                  label="Card / Other"
                  moneyIn={
                    report.methodTotals.moneyIn.card +
                    report.methodTotals.moneyIn.other
                  }
                  moneyOut={
                    report.methodTotals.moneyOut.card +
                    report.methodTotals.moneyOut.other
                  }
                />
              </div>
            </section>
          </div>

          <div className="dashboard-grid" style={{ marginTop: 18 }}>
            <ReportListPanel
              title="Sales in this report"
              subtitle="Latest sales included in this daily summary."
              emptyTitle="No sales recorded"
              emptyText="Sales will appear here when the shop sells products."
            >
              {report.salesRows.slice(0, 5).map((sale) => (
                <div key={sale.saleNumber} className="attention-item">
                  <ShoppingCart size={17} />
                  <div>
                    <strong>{sale.saleNumber}</strong>
                    <span>
                      {sale.customerName} · {formatRwf(sale.totalAmountRwf)}
                    </span>
                    <span>
                      Paid: {formatRwf(sale.amountPaidRwf)} · Balance:{" "}
                      {formatRwf(sale.balanceRwf)}
                    </span>
                  </div>
                </div>
              ))}
            </ReportListPanel>

            <ReportListPanel
              title="Expenses in this report"
              subtitle="Approved money-out records for this date."
              emptyTitle="No approved expenses"
              emptyText="Expenses will appear here after approval."
            >
              {report.expenseRows.slice(0, 5).map((expense) => (
                <div key={expense.expenseNumber} className="attention-item">
                  <ReceiptText size={17} />
                  <div>
                    <strong>{expense.expenseNumber}</strong>
                    <span>
                      {expense.title} · {formatRwf(expense.amountRwf)}
                    </span>
                    <span>
                      {expense.category} · {expense.method} · {expense.status}
                    </span>
                  </div>
                </div>
              ))}
            </ReportListPanel>
          </div>

          <div className="dashboard-grid" style={{ marginTop: 18 }}>
            <ReportListPanel
              title="Open customer debts"
              subtitle="Customers who still owe money."
              emptyTitle="No open customer debt"
              emptyText="Open debts will appear here."
            >
              {report.debtRows.slice(0, 5).map((debt) => (
                <div
                  key={`${debt.customerName}-${debt.saleNumber}`}
                  className="attention-item"
                >
                  <WalletCards size={17} />
                  <div>
                    <strong>{debt.customerName}</strong>
                    <span>
                      Balance: {formatRwf(debt.balanceRwf)} · Sale:{" "}
                      {debt.saleNumber}
                    </span>
                    <span>Expected: {formatDate(debt.expectedPaymentAt)}</span>
                  </div>
                </div>
              ))}
            </ReportListPanel>

            <ReportListPanel
              title="Low-stock products"
              subtitle="Products that need attention."
              emptyTitle="No low-stock product"
              emptyText="Low-stock products will appear here."
            >
              {report.lowStockRows.slice(0, 5).map((product) => (
                <div key={product.sku} className="attention-item">
                  <Boxes size={17} />
                  <div>
                    <strong>{product.name}</strong>
                    <span>
                      SKU: {product.sku} · Stock: {product.currentStock}
                    </span>
                    <span>
                      Alert at {product.lowStockAlert} · Price{" "}
                      {formatRwf(product.sellingPriceRwf)}
                    </span>
                  </div>
                </div>
              ))}
            </ReportListPanel>
          </div>

          <section
            className="table-card premium-panel"
            style={{ marginTop: 18 }}
          >
            <div className="table-card-header">
              <div>
                <div className="table-title">Money ledger proof</div>
                <div className="app-subtitle">
                  Latest money proof records included in this report.
                </div>
              </div>

              <span className="badge badge-blue">
                {report.moneyRows.length} record(s)
              </span>
            </div>

            <div className="tbl-overflow">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Direction</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Category</th>
                    <th>Actor</th>
                  </tr>
                </thead>

                <tbody>
                  {report.moneyRows.slice(0, 8).map((entry, index) => (
                    <tr key={`${entry.time}-${entry.category}-${index}`}>
                      <td>{formatDate(entry.time)}</td>
                      <td>
                        <span
                          className={
                            entry.direction === "money_in"
                              ? "badge badge-green"
                              : entry.direction === "money_out"
                                ? "badge badge-orange"
                                : "badge badge-blue"
                          }
                        >
                          {entry.direction}
                        </span>
                      </td>
                      <td>{formatRwf(entry.amountRwf)}</td>
                      <td>{entry.method}</td>
                      <td>{entry.category}</td>
                      <td>{entry.actorName}</td>
                    </tr>
                  ))}

                  {report.moneyRows.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div
                          style={{
                            padding: 24,
                            textAlign: "center",
                            color: "var(--gray-500)",
                            fontWeight: 800,
                          }}
                        >
                          No money ledger proof found for this date.
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {hasDownloadableData ? (
            <section
              className="table-card premium-panel"
              style={{
                marginTop: 18,
                padding: 18,
                borderColor: "rgba(34, 197, 94, 0.22)",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <ShieldCheck size={20} style={{ color: "var(--green)" }} />
                <div>
                  <strong style={{ color: "var(--gray-900)" }}>
                    Downloadable PDF proof is ready
                  </strong>
                  <p
                    style={{
                      marginTop: 4,
                      color: "var(--gray-600)",
                      fontWeight: 750,
                    }}
                  >
                    The PDF is generated by the backend from database records.
                    Use it as a daily proof file for shop activity.
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}

type ReportMetricProps = {
  icon: React.ReactNode;
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

type ProofRowProps = {
  icon: React.ReactNode;
  title: string;
  text: string;
};

function ProofRow({ icon, title, text }: ProofRowProps) {
  return (
    <div className="attention-item">
      {icon}
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
  return (
    <div className="attention-item">
      <Banknote size={17} />
      <div>
        <strong>{label}</strong>
        <span>
          Received: {formatRwf(moneyIn)} · Spent: {formatRwf(moneyOut)}
        </span>
      </div>
    </div>
  );
}

type ReportListPanelProps = {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyText: string;
  children: React.ReactNode;
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
