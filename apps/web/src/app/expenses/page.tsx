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
import { FormEvent, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
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
    event: React.MouseEvent<HTMLButtonElement>,
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
      await loadData("", "");
      setSearch("");
      setStatusFilter("");

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
      <section className="dashboard-hero">
        <div>
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

        <div className="dashboard-hero-actions">
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
        <div
          className="table-card premium-panel"
          style={{
            marginBottom: 18,
            padding: 16,
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            alignItems: "center",
            borderColor: "rgba(245, 158, 11, 0.35)",
            background: "var(--gold-lt)",
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <AlertTriangle size={20} style={{ color: "var(--orange)" }} />
            <div>
              <strong style={{ color: "var(--gray-900)" }}>
                Paid expenses are blocked
              </strong>
              <p
                style={{
                  marginTop: 4,
                  color: "var(--gray-600)",
                  fontWeight: 750,
                }}
              >
                {cashMessage}
              </p>
            </div>
          </div>

          <button
            className="btn btn-primary"
            type="button"
            onClick={() => router.push("/cash")}
          >
            <WalletCards size={14} />
            {cashSession ? "View cash" : "Open cash"}
          </button>
        </div>
      ) : null}

      <div className="premium-stats-grid">
        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <ReceiptText size={20} />
            </div>
            <span className="badge badge-blue">All</span>
          </div>
          <div className="stat-label">Expense records</div>
          <div className="stat-value">{expenses.length}</div>
          <div className="stat-help">
            All expense requests and approved costs
          </div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <CheckCircle2 size={20} />
            </div>
            <span className="badge badge-green">Approved</span>
          </div>
          <div className="stat-label">Approved expenses</div>
          <div className="stat-value" style={{ fontSize: 24 }}>
            {formatRwf(totalApprovedAmount)}
          </div>
          <div className="stat-help">
            {approvedExpenses.length} approved expense(s)
          </div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <Clock3 size={20} />
            </div>
            <span className="badge badge-orange">Review</span>
          </div>
          <div className="stat-label">Waiting review</div>
          <div className="stat-value" style={{ fontSize: 24 }}>
            {formatRwf(totalWaitingAmount)}
          </div>
          <div className="stat-help">
            {waitingExpenses.length} waiting owner approval
          </div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <XCircle size={20} />
            </div>
            <span className="badge badge-orange">Rejected</span>
          </div>
          <div className="stat-label">Rejected expenses</div>
          <div className="stat-value">{rejectedExpenses.length}</div>
          <div className="stat-help">Rejected or invalid expense requests</div>
        </div>
      </div>

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

      <section className="table-card premium-panel">
        <div className="table-card-header">
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

        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <form
            onSubmit={handleSearch}
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div className="hdr-search" style={{ flex: "1 1 260px" }}>
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
              style={{
                height: 40,
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--card)",
                color: "var(--gray-900)",
                padding: "0 12px",
                fontWeight: 800,
              }}
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

        <div className="tbl-overflow">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Expense</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Created by</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>
                    <div style={{ fontWeight: 900, color: "var(--gray-900)" }}>
                      {expense.title}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: "var(--gray-500)",
                        fontWeight: 800,
                      }}
                    >
                      {expense.expenseNumber} · {formatDate(expense.createdAt)}
                    </div>
                    {expense.description ? (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          color: "var(--gray-400)",
                          fontWeight: 750,
                        }}
                      >
                        {expense.description}
                      </div>
                    ) : null}
                  </td>

                  <td>
                    <span className="badge badge-blue">
                      {expense.categoryNameSnapshot}
                    </span>
                  </td>

                  <td>
                    <strong style={{ color: "var(--gray-900)" }}>
                      {formatRwf(expense.amountRwf)}
                    </strong>
                  </td>

                  <td>{expense.method}</td>

                  <td>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <span className={statusBadgeClass(expense.status)}>
                        {expense.status}
                      </span>

                      {expense.isActive !== 1 ? (
                        <span className="badge badge-orange">inactive</span>
                      ) : null}

                      {expense.rejectionReason ? (
                        <span
                          style={{
                            color: "var(--gray-500)",
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          {expense.rejectionReason}
                        </span>
                      ) : null}
                    </div>
                  </td>

                  <td>{expense.createdByName || "Unknown"}</td>

                  <td style={{ textAlign: "right" }}>
                    {canApproveExpense &&
                    expense.status === "waiting_owner_review" &&
                    expense.isActive === 1 ? (
                      <button
                        type="button"
                        onClick={(event) => toggleActionMenu(event, expense)}
                        className="hdr-icon"
                        style={{
                          marginLeft: "auto",
                          width: 32,
                          height: 32,
                        }}
                        aria-label={`Open actions for ${expense.title}`}
                      >
                        <MoreVertical size={16} />
                      </button>
                    ) : (
                      <span
                        style={{ color: "var(--gray-400)", fontWeight: 900 }}
                      >
                        {expense.status === "approved"
                          ? "Ledger saved"
                          : "No action"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div
                      style={{
                        padding: 26,
                        textAlign: "center",
                        color: "var(--gray-500)",
                        fontWeight: 800,
                      }}
                    >
                      No expenses found.
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
              <form onSubmit={handleCreateExpense} className="staff-modal-body">
                <div className="staff-form-grid">
                  <label className="staff-form-group">
                    <span>Category</span>
                    <input
                      value={categoryName}
                      onChange={(event) => setCategoryName(event.target.value)}
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
                  <div
                    style={{
                      border: "1px solid rgba(245, 158, 11, 0.35)",
                      borderRadius: 16,
                      padding: 14,
                      background: "var(--gold-lt)",
                      color: "var(--gray-900)",
                      fontWeight: 800,
                    }}
                  >
                    Open cash first. Owner expenses are paid immediately, so the
                    money ledger needs an open cash session.
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
              <form onSubmit={handleRejectExpense} className="staff-modal-body">
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    padding: 14,
                    background: "var(--gray-50)",
                    color: "var(--gray-900)",
                  }}
                >
                  <div className="staff-form-section-title">Expense</div>
                  <div style={{ marginTop: 8, fontWeight: 900 }}>
                    {selectedExpense.expenseNumber} · {selectedExpense.title}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      color: "var(--gray-600)",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    {formatRwf(selectedExpense.amountRwf)} ·{" "}
                    {selectedExpense.categoryNameSnapshot}
                  </div>
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
    </AppShell>
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
