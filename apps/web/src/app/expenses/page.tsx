"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  MoreVertical,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import { AuthUser, getCurrentUser, getToken } from "@/lib/auth";
import { CashSession, getCashToday } from "@/lib/cash";
import {
  Expense,
  ExpenseCategory,
  ExpenseMethod,
  ExpenseStatus,
  approveExpense,
  createExpense,
  deactivateExpense,
  getExpenseCategories,
  getExpenses,
  rejectExpense,
} from "@/lib/expenses";
import type { FormEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";

type ModalMode = "create" | "reject" | null;

type ActionMenuState = {
  expenseId: string;
  x: number;
  y: number;
  direction: "down" | "up";
};

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

function localDateTimeValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);

  return localDate.toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string) {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

function hasPermission(user: AuthUser | null, permission: string) {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (user.permissions.includes("*")) return true;
  return user.permissions.includes(permission);
}

function statusBadgeClass(status: ExpenseStatus) {
  if (status === "approved") return "badge badge-green";
  if (status === "rejected") return "badge badge-orange";
  return "badge badge-blue";
}

function readableStatus(status: ExpenseStatus) {
  if (status === "waiting_owner_review") return "Waiting review";
  return status.replaceAll("_", " ");
}

export default function ExpensesPage() {
  const router = useRouter();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [visibleCount, setVisibleCount] = useState(10);

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);

  const [categoryName, setCategoryName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amountRwf, setAmountRwf] = useState("0");
  const [method, setMethod] = useState<ExpenseMethod>("cash");
  const [paidAt, setPaidAt] = useState(localDateTimeValue());
  const [rejectReason, setRejectReason] = useState("");

  const canCreateExpense = hasPermission(user, "expenses.create");
  const canApproveExpense = hasPermission(user, "expenses.approve");

  const isCashOpen = cashSession?.status === "open";

  const cashMessage = !cashSession
    ? "Cash session is not open. Open cash before recording paid expenses."
    : cashSession.status === "closed"
      ? "Cash session is closed. Paid expenses are blocked for this business date."
      : "";

  const approvedExpenses = useMemo(
    () => expenses.filter((expense) => expense.status === "approved"),
    [expenses],
  );

  const waitingExpenses = useMemo(
    () =>
      expenses.filter((expense) => expense.status === "waiting_owner_review"),
    [expenses],
  );

  const rejectedExpenses = useMemo(
    () => expenses.filter((expense) => expense.status === "rejected"),
    [expenses],
  );

  const totalApprovedAmount = useMemo(
    () =>
      approvedExpenses.reduce(
        (sum, expense) => sum + Number(expense.amountRwf || 0),
        0,
      ),
    [approvedExpenses],
  );

  const totalWaitingAmount = useMemo(
    () =>
      waitingExpenses.reduce(
        (sum, expense) => sum + Number(expense.amountRwf || 0),
        0,
      ),
    [waitingExpenses],
  );

  const visibleExpenses = useMemo(
    () => expenses.slice(0, visibleCount),
    [expenses, visibleCount],
  );

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!actionMenu) return;

    function closeMenu() {
      setActionMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [actionMenu]);

  async function loadData(nextSearch = search, nextStatus = statusFilter) {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setMessage("");

    try {
      const [meResponse, cashResponse, expensesResponse, categoriesResponse] =
        await Promise.all([
          getCurrentUser(token),
          getCashToday(token),
          getExpenses(token, {
            search: nextSearch,
            status: nextStatus,
          }),
          getExpenseCategories(token),
        ]);

      setUser(meResponse.user);
      setCashSession(cashResponse.session);
      setExpenses(expensesResponse.expenses);
      setCategories(categoriesResponse.categories);
      setVisibleCount(10);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load expenses.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setCategoryName("");
    setTitle("");
    setDescription("");
    setAmountRwf("0");
    setMethod("cash");
    setPaidAt(localDateTimeValue());
    setRejectReason("");
    setSelectedExpense(null);
    setSaving(false);
  }

  function openCreateModal() {
    resetForm();
    setActionMenu(null);
    setModalMode("create");
  }

  function openRejectModal(expense: Expense) {
    setSelectedExpense(expense);
    setRejectReason("");
    setActionMenu(null);
    setModalMode("reject");
  }

  function closeModal() {
    setModalMode(null);
    resetForm();
  }

  function toggleActionMenu(
    event: MouseEvent<HTMLButtonElement>,
    expense: Expense,
  ) {
    event.stopPropagation();

    if (actionMenu?.expenseId === expense.id) {
      setActionMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 230;
    const menuHeight = 190;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const direction: "down" | "up" =
      spaceBelow < menuHeight && spaceAbove > spaceBelow ? "up" : "down";

    setActionMenu({
      expenseId: expense.id,
      direction,
      x: Math.max(
        12,
        Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12),
      ),
      y: direction === "down" ? rect.bottom + 8 : rect.top - 8,
    });
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadData(search, statusFilter);
  }

  async function handleCreateExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreateExpense) {
      setMessage("You do not have permission to create expenses.");
      return;
    }

    if (!isCashOpen && user?.role === "owner") {
      setMessage(cashMessage || "Open cash before recording paid expenses.");
      return;
    }

    const token = getToken();
    if (!token) return;

    setSaving(true);
    setMessage("");

    try {
      await createExpense(token, {
        categoryName,
        title,
        description,
        amountRwf: Number(amountRwf || 0),
        method,
        paidAt: localDateTimeToIso(paidAt),
      });

      closeModal();
      setSearch("");
      setStatusFilter("");
      await loadData("", "");

      setMessage(
        user?.role === "owner"
          ? "Expense recorded and approved successfully."
          : "Expense submitted for owner review.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create expense.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveExpense(expense: Expense) {
    if (!canApproveExpense) {
      setMessage("You do not have permission to approve expenses.");
      return;
    }

    if (!isCashOpen) {
      setMessage(cashMessage || "Open cash before approving paid expenses.");
      return;
    }

    const token = getToken();
    if (!token) return;

    setActionMenu(null);
    setMessage("");

    try {
      await approveExpense(token, expense.id);
      await loadData();
      setMessage("Expense approved and money-out ledger recorded.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not approve expense.",
      );
    }
  }

  async function handleRejectExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedExpense) return;

    const token = getToken();
    if (!token) return;

    setSaving(true);
    setMessage("");

    try {
      await rejectExpense(token, selectedExpense.id, {
        reason: rejectReason,
      });

      closeModal();
      await loadData();
      setMessage("Expense rejected.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not reject expense.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivateExpense(expense: Expense) {
    const token = getToken();
    if (!token) return;

    setActionMenu(null);
    setMessage("");

    try {
      await deactivateExpense(token, expense.id);
      await loadData();
      setMessage("Expense deactivated.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not deactivate expense.",
      );
    }
  }

  const menuExpense = actionMenu
    ? expenses.find((expense) => expense.id === actionMenu.expenseId)
    : null;

  return (
    <AppShell title="Expenses">
      <div className={styles.expensesPage}>
        <section className={`dashboard-hero ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className="hero-kicker dashboard-kicker">
              <ReceiptText size={15} />
              Shop money out
            </span>

            <h1>Expenses</h1>

            <p>
              Record shop costs, keep owner approval, and connect approved
              expenses to the money ledger.
            </p>
          </div>

          <div className={`dashboard-hero-actions ${styles.heroActions}`}>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => loadData()}
            >
              <RefreshCw size={14} />
              Refresh
            </button>

            {!isCashOpen ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => router.push("/cash")}
              >
                <WalletCards size={14} />
                {cashSession ? "View cash" : "Open cash"}
              </button>
            ) : null}

            {canCreateExpense ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={openCreateModal}
              >
                <Plus size={14} />
                New expense
              </button>
            ) : null}
          </div>
        </section>

        {!isCashOpen ? (
          <NoticeCard
            title="Paid expenses are blocked"
            text={cashMessage}
            actionLabel={cashSession ? "View cash" : "Open cash"}
            onAction={() => router.push("/cash")}
          />
        ) : null}

        <div className={styles.metricsGrid}>
          <MetricCard
            icon={<ReceiptText size={20} />}
            label="Expense records"
            value={String(expenses.length)}
            help="All expense requests and approved costs"
            badge="All"
            badgeClass="badge badge-blue"
          />

          <MetricCard
            icon={<CheckCircle2 size={20} />}
            label="Approved expenses"
            value={formatRwf(totalApprovedAmount)}
            help={`${approvedExpenses.length} approved expense(s)`}
            badge="Approved"
            badgeClass="badge badge-green"
          />

          <MetricCard
            icon={<Clock3 size={20} />}
            label="Waiting review"
            value={formatRwf(totalWaitingAmount)}
            help={`${waitingExpenses.length} waiting owner approval`}
            badge="Review"
            badgeClass="badge badge-orange"
          />

          <MetricCard
            icon={<XCircle size={20} />}
            label="Rejected expenses"
            value={String(rejectedExpenses.length)}
            help="Rejected or invalid expense requests"
            badge="Rejected"
            badgeClass="badge badge-orange"
          />
        </div>

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        <section className={styles.listPanel}>
          <div className={styles.panelHeader}>
            <div>
              <div className="table-title">Expense list</div>
              <div className="app-subtitle">
                Search, submit, approve, reject, and deactivate expense records.
              </div>
            </div>

            {loading ? (
              <Loader2
                className="spin"
                size={20}
                style={{ color: "var(--orange)" }}
              />
            ) : null}
          </div>

          <div className={styles.filterBar}>
            <form onSubmit={handleSearch} className={styles.filterForm}>
              <div className="hdr-search">
                <Search size={14} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search expense number, title, category..."
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">All status</option>
                <option value="waiting_owner_review">Waiting review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>

              <button className="btn btn-outline" type="submit">
                <Search size={14} />
                Search
              </button>

              <button
                className="btn btn-outline"
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("");
                  loadData("", "");
                }}
              >
                Clear
              </button>
            </form>
          </div>

          <div className={styles.expenseList}>
            {visibleExpenses.map((expense) => {
              const canAct =
                canApproveExpense &&
                expense.status === "waiting_owner_review" &&
                expense.isActive === 1;

              return (
                <article key={expense.id} className={styles.expenseCard}>
                  <div className={styles.expenseIcon}>
                    <ReceiptText size={18} />
                  </div>

                  <div className={styles.expenseMain}>
                    <div className={styles.expenseTop}>
                      <div>
                        <strong>{expense.title}</strong>
                        <span>
                          {expense.expenseNumber} ·{" "}
                          {formatDate(expense.createdAt)}
                        </span>
                      </div>

                      <div className={styles.expenseTopBadges}>
                        <span className={statusBadgeClass(expense.status)}>
                          {readableStatus(expense.status)}
                        </span>

                        {expense.isActive !== 1 ? (
                          <span className="badge badge-orange">Inactive</span>
                        ) : null}
                      </div>
                    </div>

                    {expense.description ? (
                      <p className={styles.expenseDescription}>
                        {expense.description}
                      </p>
                    ) : null}

                    <div className={styles.expenseDetailsGrid}>
                      <DetailBlock
                        label="Category"
                        value={expense.categoryNameSnapshot}
                      />
                      <DetailBlock
                        label="Amount"
                        value={formatRwf(expense.amountRwf)}
                        strong
                      />
                      <DetailBlock label="Method" value={expense.method} />
                      <DetailBlock
                        label="Created by"
                        value={expense.createdByName || "Unknown"}
                      />
                    </div>

                    {expense.rejectionReason ? (
                      <div className={styles.rejectionBox}>
                        <strong>Rejection reason</strong>
                        <span>{expense.rejectionReason}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.cardAction}>
                    {canAct ? (
                      <button
                        type="button"
                        onClick={(event) => toggleActionMenu(event, expense)}
                        className="hdr-icon"
                        aria-label={`Open actions for ${expense.title}`}
                      >
                        <MoreVertical size={16} />
                      </button>
                    ) : (
                      <span>
                        {expense.status === "approved"
                          ? "Ledger saved"
                          : "No action"}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}

            {expenses.length === 0 ? (
              <div className={styles.emptyCard}>
                <Search size={18} />
                <div>
                  <strong>No expenses found</strong>
                  <span>Create an expense or change your search filters.</span>
                </div>
              </div>
            ) : null}
          </div>

          {expenses.length > visibleCount ? (
            <div className={styles.loadMoreWrap}>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setVisibleCount((current) => current + 10)}
              >
                Load more expenses
              </button>
            </div>
          ) : null}
        </section>

        {actionMenu && menuExpense ? (
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "fixed",
              left: actionMenu.x,
              top: actionMenu.y,
              transform:
                actionMenu.direction === "up" ? "translateY(-100%)" : "none",
              width: 230,
              zIndex: 1000,
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow: "var(--sh-lg)",
              padding: 6,
            }}
          >
            <button
              type="button"
              onClick={() => handleApproveExpense(menuExpense)}
              className="staff-menu-item success"
            >
              <CheckCircle2 size={15} />
              Approve expense
            </button>

            <button
              type="button"
              onClick={() => openRejectModal(menuExpense)}
              className="staff-menu-item danger"
            >
              <XCircle size={15} />
              Reject expense
            </button>

            <div
              style={{
                height: 1,
                background: "var(--border)",
                margin: "6px 0",
              }}
            />

            <button
              type="button"
              onClick={() => handleDeactivateExpense(menuExpense)}
              className="staff-menu-item danger"
            >
              <Trash2 size={15} />
              Deactivate
            </button>
          </div>
        ) : null}

        {modalMode ? (
          <div className="staff-modal-backdrop">
            <div className="staff-modal">
              <div className="staff-modal-header">
                <div>
                  <div className="staff-modal-icon">
                    {modalMode === "create" ? (
                      <ReceiptText size={22} />
                    ) : (
                      <XCircle size={22} />
                    )}
                  </div>

                  <h2>
                    {modalMode === "create" ? "New expense" : "Reject expense"}
                  </h2>

                  <p>
                    {modalMode === "create"
                      ? user?.role === "owner"
                        ? "Owner expenses are approved immediately and recorded as money out."
                        : "Employee expenses wait for owner approval before money leaves the ledger."
                      : "Reject this expense request and keep it out of the money ledger."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="staff-modal-close"
                >
                  <X size={18} />
                </button>
              </div>

              {modalMode === "create" ? (
                <form
                  onSubmit={handleCreateExpense}
                  className="staff-modal-body"
                >
                  <div className="staff-form-grid">
                    <label className="staff-form-group">
                      <span>Category</span>
                      <input
                        value={categoryName}
                        onChange={(event) =>
                          setCategoryName(event.target.value)
                        }
                        list="expense-categories"
                        placeholder="Example: Transport"
                        required
                      />
                      <datalist id="expense-categories">
                        {categories.map((category) => (
                          <option key={category.id} value={category.name} />
                        ))}
                      </datalist>
                    </label>

                    <label className="staff-form-group">
                      <span>Expense title</span>
                      <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Example: Delivery transport"
                        required
                      />
                    </label>

                    <label className="staff-form-group">
                      <span>Amount</span>
                      <input
                        type="number"
                        min={1}
                        value={amountRwf}
                        onChange={(event) => setAmountRwf(event.target.value)}
                        required
                      />
                    </label>

                    <label className="staff-form-group">
                      <span>Payment method</span>
                      <select
                        value={method}
                        onChange={(event) =>
                          setMethod(event.target.value as ExpenseMethod)
                        }
                      >
                        <option value="cash">Cash</option>
                        <option value="momo">MoMo</option>
                        <option value="bank">Bank</option>
                        <option value="card">Card</option>
                        <option value="other">Other</option>
                      </select>
                    </label>

                    <label className="staff-form-group">
                      <span>Paid time</span>
                      <input
                        type="datetime-local"
                        value={paidAt}
                        onChange={(event) => setPaidAt(event.target.value)}
                      />
                    </label>
                  </div>

                  <label className="staff-form-group">
                    <span>Description</span>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Example: Transport used to bring stock from Kigali bus park."
                    />
                  </label>

                  {user?.role === "owner" && !isCashOpen ? (
                    <div className={styles.modalWarning}>
                      Open cash first. Owner expenses are paid immediately, so
                      the money ledger needs an open cash session.
                    </div>
                  ) : null}

                  <ModalFooter
                    saving={saving}
                    onCancel={closeModal}
                    disabled={user?.role === "owner" && !isCashOpen}
                    label={
                      user?.role === "owner"
                        ? "Record expense"
                        : "Submit for review"
                    }
                  />
                </form>
              ) : null}

              {modalMode === "reject" && selectedExpense ? (
                <form
                  onSubmit={handleRejectExpense}
                  className="staff-modal-body"
                >
                  <div className={styles.rejectSummary}>
                    <div className="staff-form-section-title">Expense</div>
                    <strong>
                      {selectedExpense.expenseNumber} · {selectedExpense.title}
                    </strong>
                    <span>
                      {formatRwf(selectedExpense.amountRwf)} ·{" "}
                      {selectedExpense.categoryNameSnapshot}
                    </span>
                  </div>

                  <label className="staff-form-group">
                    <span>Rejection reason</span>
                    <textarea
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Example: No receipt or not approved by owner."
                    />
                  </label>

                  <ModalFooter
                    saving={saving}
                    onCancel={closeModal}
                    label="Reject expense"
                  />
                </form>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

type MetricCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
  help: string;
  badge: string;
  badgeClass: string;
};

function MetricCard({
  icon,
  label,
  value,
  help,
  badge,
  badgeClass,
}: MetricCardProps) {
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

type NoticeCardProps = {
  title: string;
  text: string;
  actionLabel: string;
  onAction: () => void;
};

function NoticeCard({ title, text, actionLabel, onAction }: NoticeCardProps) {
  return (
    <div className={styles.noticeCard}>
      <div className={styles.noticeContent}>
        <AlertTriangle size={20} />
        <div>
          <strong>{title}</strong>
          <p>{text}</p>
        </div>
      </div>

      <button className="btn btn-primary" type="button" onClick={onAction}>
        <WalletCards size={14} />
        {actionLabel}
      </button>
    </div>
  );
}

type DetailBlockProps = {
  label: string;
  value: string;
  strong?: boolean;
};

function DetailBlock({ label, value, strong = false }: DetailBlockProps) {
  return (
    <div className={styles.detailBlock}>
      <span>{label}</span>
      <strong className={strong ? styles.amountText : ""}>
        {value || "Not set"}
      </strong>
    </div>
  );
}

type ModalFooterProps = {
  saving: boolean;
  onCancel: () => void;
  label: string;
  disabled?: boolean;
};

function ModalFooter({ saving, onCancel, label, disabled }: ModalFooterProps) {
  return (
    <div className="staff-modal-footer">
      <button
        type="button"
        onClick={onCancel}
        className="staff-btn staff-btn-outline"
      >
        Cancel
      </button>

      <AsyncButton loading={saving} disabled={disabled} type="submit">
        <Plus size={15} />
        {label}
      </AsyncButton>
    </div>
  );
}
