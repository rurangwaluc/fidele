"use client";

import {
  AlertTriangle,
  Banknote,
  Boxes,
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
import { AuthUser, getCurrentUser, getToken } from "@/lib/auth";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { ProblemSeverity, ShopProblem, getProblems } from "@/lib/problems";

import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "next/navigation";

function getTodayDate() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hasPermission(user: AuthUser | null, permission: string) {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (user.permissions.includes("*")) return true;
  return user.permissions.includes(permission);
}

function getSeverityBadge(severity: ProblemSeverity) {
  if (severity === "critical") return "badge badge-orange";
  if (severity === "warning") return "badge badge-blue";
  return "badge badge-green";
}

function getSeverityLabel(severity: ProblemSeverity) {
  if (severity === "critical") return "Urgent";
  if (severity === "warning") return "Needs review";
  return "Note";
}

function getProblemIcon(problem: ShopProblem) {
  if (problem.category === "cash") return <Banknote size={18} />;
  if (problem.category === "debt") return <WalletCards size={18} />;
  if (problem.category === "expense") return <ReceiptText size={18} />;
  if (problem.category === "stock") return <Boxes size={18} />;
  return <ShoppingCart size={18} />;
}

export default function ProblemsPage() {
  const router = useRouter();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [businessDate, setBusinessDate] = useState(getTodayDate());
  const [problems, setProblems] = useState<ShopProblem[]>([]);
  const [cashProblems, setCashProblems] = useState<ShopProblem[]>([]);
  const [debtProblems, setDebtProblems] = useState<ShopProblem[]>([]);
  const [expenseProblems, setExpenseProblems] = useState<ShopProblem[]>([]);
  const [stockProblems, setStockProblems] = useState<ShopProblem[]>([]);
  const [salesProblems, setSalesProblems] = useState<ShopProblem[]>([]);
  const [cleanAreas, setCleanAreas] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const canViewProblems = hasPermission(user, "problems.view");

  const criticalProblems = useMemo(
    () => problems.filter((problem) => problem.severity === "critical"),
    [problems],
  );

  const warningProblems = useMemo(
    () => problems.filter((problem) => problem.severity === "warning"),
    [problems],
  );

  const infoProblems = useMemo(
    () => problems.filter((problem) => problem.severity === "info"),
    [problems],
  );

  const urgentProblems = useMemo(
    () =>
      problems.filter(
        (problem) =>
          problem.severity === "critical" || problem.severity === "warning",
      ),
    [problems],
  );

  useEffect(() => {
    loadProblems(businessDate);
  }, []);

  async function loadProblems(nextDate = businessDate) {
    const token = getToken();

    if (!token) {
      setMessage("You are not logged in.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const [meResponse, problemsResponse] = await Promise.all([
        getCurrentUser(token),
        getProblems(token, nextDate),
      ]);

      setUser(meResponse.user);
      setBusinessDate(problemsResponse.businessDate);
      setProblems(problemsResponse.problems);
      setCashProblems(problemsResponse.groups.cashProblems);
      setDebtProblems(problemsResponse.groups.debtProblems);
      setExpenseProblems(problemsResponse.groups.expenseProblems);
      setStockProblems(problemsResponse.groups.stockProblems);
      setSalesProblems(problemsResponse.groups.salesProblems);
      setCleanAreas(problemsResponse.summary.cleanAreas);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load problems.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadProblems(businessDate);
  }

  return (
    <AppShell title="Problems">
      <section className="dashboard-hero">
        <div>
          <span className="hero-kicker dashboard-kicker">
            <AlertTriangle size={15} />
            Owner attention center
          </span>

          <h1>Problems</h1>

          <p>
            See what needs owner attention: cash, customer payments, expenses,
            stock, and sales.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <form
            onSubmit={handleDateSubmit}
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              type="date"
              value={businessDate}
              onChange={(event) => setBusinessDate(event.target.value)}
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
              Check date
            </button>
          </form>

          <button
            className="btn btn-outline"
            type="button"
            onClick={() => loadProblems(businessDate)}
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

      {!canViewProblems && user ? (
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
          You do not have permission to view shop problems.
        </div>
      ) : null}

      {loading ? (
        <div className="loading-card">
          <Loader2 className="spin" size={18} />
          <div>
            <strong>Checking shop problems...</strong>
            <p>Looking at cash, payments, expenses, stock, and sales.</p>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <>
          <section
            className="table-card premium-panel"
            style={{
              marginBottom: 18,
              padding: 18,
              borderColor:
                criticalProblems.length > 0 || warningProblems.length > 0
                  ? "rgba(245, 158, 11, 0.35)"
                  : "rgba(34, 197, 94, 0.28)",
              background:
                criticalProblems.length > 0 || warningProblems.length > 0
                  ? "var(--gold-lt)"
                  : "var(--green-lt)",
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
                  {problems.length === 0 ? (
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
                    {problems.length === 0
                      ? "The shop looks clean right now."
                      : "Some things need attention."}
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
                    {problems.length === 0
                      ? "No urgent issue was found for this date."
                      : "Start with urgent items, then review warnings before closing the day."}
                  </div>
                </div>
              </div>

              <StatusMini
                label="Urgent"
                value={String(criticalProblems.length)}
                danger={criticalProblems.length > 0}
              />
              <StatusMini
                label="Needs review"
                value={String(warningProblems.length)}
                danger={warningProblems.length > 0}
              />
              <StatusMini
                label="Total problems"
                value={String(problems.length)}
              />
            </div>
          </section>

          <div className="premium-stats-grid">
            <ProblemMetric
              icon={<AlertTriangle size={20} />}
              label="Urgent"
              value={String(criticalProblems.length)}
              help="Needs owner action first"
              badge="Now"
              badgeClass={
                criticalProblems.length > 0
                  ? "badge badge-orange"
                  : "badge badge-green"
              }
            />

            <ProblemMetric
              icon={<Clock3 size={20} />}
              label="Needs review"
              value={String(warningProblems.length)}
              help="Check before closing day"
              badge="Review"
              badgeClass={
                warningProblems.length > 0
                  ? "badge badge-orange"
                  : "badge badge-green"
              }
            />

            <ProblemMetric
              icon={<ShieldCheck size={20} />}
              label="Notes"
              value={String(infoProblems.length)}
              help="Useful things to know"
              badge="Info"
              badgeClass="badge badge-blue"
            />

            <ProblemMetric
              icon={<CheckCircle2 size={20} />}
              label="Clean areas"
              value={String(cleanAreas.length)}
              help={cleanAreas.length > 0 ? cleanAreas.join(", ") : "None yet"}
              badge="Clean"
              badgeClass="badge badge-green"
            />
          </div>

          <ProblemSection
            title="Start here"
            subtitle="Most important problems to fix first."
            emptyTitle="No urgent problem"
            emptyText="There is no urgent item for this date."
            problems={urgentProblems}
            onAction={(href) => router.push(href)}
          />

          <div className="dashboard-grid" style={{ marginTop: 18 }}>
            <ProblemSection
              title="Customer payments"
              subtitle="Overdue payments, payments due today, and installments."
              emptyTitle="No customer payment problem"
              emptyText="Customer payments look clean."
              problems={debtProblems}
              onAction={(href) => router.push(href)}
            />

            <ProblemSection
              title="Stock problems"
              subtitle="Products with low or zero stock."
              emptyTitle="No stock problem"
              emptyText="Stock looks clean."
              problems={stockProblems}
              onAction={(href) => router.push(href)}
            />
          </div>

          <div className="dashboard-grid" style={{ marginTop: 18 }}>
            <ProblemSection
              title="Expense approvals"
              subtitle="Expenses waiting for owner review."
              emptyTitle="No expense problem"
              emptyText="No expense needs attention."
              problems={expenseProblems}
              onAction={(href) => router.push(href)}
            />

            <ProblemSection
              title="Cash problems"
              subtitle="Cash opening, closing, differences, and reopened cash."
              emptyTitle="No cash problem"
              emptyText="Cash looks clean."
              problems={cashProblems}
              onAction={(href) => router.push(href)}
            />
          </div>

          <ProblemSection
            title="Sales notes"
            subtitle="Sales that still need attention."
            emptyTitle="No sales problem"
            emptyText="Sales look clean."
            problems={salesProblems}
            onAction={(href) => router.push(href)}
          />
        </>
      ) : null}
    </AppShell>
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

type ProblemMetricProps = {
  icon: ReactNode;
  label: string;
  value: string;
  help: string;
  badge: string;
  badgeClass: string;
};

function ProblemMetric({
  icon,
  label,
  value,
  help,
  badge,
  badgeClass,
}: ProblemMetricProps) {
  return (
    <div className="premium-stat-card">
      <div className="stat-card-top">
        <div className="feature-icon">{icon}</div>
        <span className={badgeClass}>{badge}</span>
      </div>

      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-help">{help}</div>
    </div>
  );
}

type ProblemSectionProps = {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyText: string;
  problems: ShopProblem[];
  onAction: (href: string) => void;
};

function ProblemSection({
  title,
  subtitle,
  emptyTitle,
  emptyText,
  problems,
  onAction,
}: ProblemSectionProps) {
  return (
    <section className="table-card premium-panel" style={{ marginTop: 18 }}>
      <div className="table-card-header">
        <div>
          <div className="table-title">{title}</div>
          <div className="app-subtitle">{subtitle}</div>
        </div>

        <span
          className={
            problems.length > 0 ? "badge badge-orange" : "badge badge-green"
          }
        >
          {problems.length > 0 ? `${problems.length} item(s)` : "Clean"}
        </span>
      </div>

      <div className="attention-list">
        {problems.map((problem) => (
          <div key={problem.id} className="attention-item">
            {getProblemIcon(problem)}

            <div>
              <strong>{problem.title}</strong>
              <span>{problem.message}</span>
              <span>Detected {formatDate(problem.detectedAt)}</span>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <span className={getSeverityBadge(problem.severity)}>
                {getSeverityLabel(problem.severity)}
              </span>

              <button
                className="btn btn-outline"
                type="button"
                onClick={() => onAction(problem.actionHref)}
                style={{ height: 34 }}
              >
                {problem.actionLabel}
              </button>
            </div>
          </div>
        ))}

        {problems.length === 0 ? (
          <div className="attention-item">
            <CheckCircle2 size={17} />
            <div>
              <strong>{emptyTitle}</strong>
              <span>{emptyText}</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
