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
  WalletCards,
} from "lucide-react";
import { AuthUser, getCurrentUser, getToken } from "@/lib/auth";
import type { FormEvent, ReactNode } from "react";
import { ProblemSeverity, ShopProblem, getProblems } from "@/lib/problems";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import styles from "./page.module.css";
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

  const hasProblems = problems.length > 0;
  const hasUrgentWork =
    criticalProblems.length > 0 || warningProblems.length > 0;

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
      <div className={styles.problemsPage}>
        <section className={`dashboard-hero ${styles.hero}`}>
          <div className={styles.heroCopy}>
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

          <div className={`dashboard-hero-actions ${styles.heroActions}`}>
            <form onSubmit={handleDateSubmit} className={styles.dateForm}>
              <input
                type="date"
                value={businessDate}
                onChange={(event) => setBusinessDate(event.target.value)}
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

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        {!canViewProblems && user ? (
          <div className={styles.permissionNotice}>
            <ShieldCheck size={20} />
            <div>
              <strong>No access</strong>
              <span>You do not have permission to view shop problems.</span>
            </div>
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

        {!loading && canViewProblems ? (
          <>
            <section
              className={
                hasUrgentWork
                  ? styles.summaryCardWarning
                  : styles.summaryCardClean
              }
            >
              <div className={styles.summaryIntro}>
                <div className="feature-icon">
                  {hasProblems ? (
                    <AlertTriangle size={21} />
                  ) : (
                    <CheckCircle2 size={21} />
                  )}
                </div>

                <div>
                  <strong>
                    {hasProblems
                      ? "Some things need attention."
                      : "The shop looks clean right now."}
                  </strong>
                  <span>
                    {hasProblems
                      ? "Start with urgent items, then review warnings before closing the day."
                      : "No urgent issue was found for this date."}
                  </span>
                </div>
              </div>

              <div className={styles.statusGrid}>
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

                <StatusMini label="Notes" value={String(infoProblems.length)} />

                <StatusMini
                  label="Total problems"
                  value={String(problems.length)}
                  danger={problems.length > 0}
                />
              </div>
            </section>

            <div className={styles.metricsGrid}>
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
                help={
                  cleanAreas.length > 0 ? cleanAreas.join(", ") : "None yet"
                }
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
              featured
            />

            <div className={styles.sectionGrid}>
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

            <div className={styles.sectionGrid}>
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
      </div>
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
    <div className={styles.statusMini}>
      <span>{label}</span>
      <strong className={danger ? styles.dangerValue : ""}>{value}</strong>
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

type ProblemSectionProps = {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyText: string;
  problems: ShopProblem[];
  onAction: (href: string) => void;
  featured?: boolean;
};

function ProblemSection({
  title,
  subtitle,
  emptyTitle,
  emptyText,
  problems,
  onAction,
  featured = false,
}: ProblemSectionProps) {
  return (
    <section
      className={
        featured
          ? `${styles.problemSection} ${styles.featuredSection}`
          : styles.problemSection
      }
    >
      <div className={styles.sectionHeader}>
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

      <div className={styles.problemList}>
        {problems.map((problem) => (
          <article key={problem.id} className={styles.problemCard}>
            <div className={styles.problemIcon}>{getProblemIcon(problem)}</div>

            <div className={styles.problemContent}>
              <div className={styles.problemTitleRow}>
                <strong>{problem.title}</strong>
                <span className={getSeverityBadge(problem.severity)}>
                  {getSeverityLabel(problem.severity)}
                </span>
              </div>

              <p>{problem.message}</p>
              <span>Detected {formatDate(problem.detectedAt)}</span>
            </div>

            <button
              className="btn btn-outline"
              type="button"
              onClick={() => onAction(problem.actionHref)}
            >
              {problem.actionLabel}
            </button>
          </article>
        ))}

        {problems.length === 0 ? (
          <div className={styles.emptyCard}>
            <CheckCircle2 size={18} />
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
