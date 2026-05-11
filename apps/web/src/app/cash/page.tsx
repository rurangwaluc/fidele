"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Coins,
  Loader2,
  LockKeyhole,
  MinusCircle,
  Plus,
  PlusCircle,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { AuthUser, getCurrentUser, getToken } from "@/lib/auth";
import {
  CashSession,
  CashTotals,
  ManualMoneyMovementInput,
  MoneyLedgerEntry,
  MoneyMethod,
  closeCashSession,
  createManualMoneyMovement,
  getCashToday,
  openCashSession,
  reopenCashSession,
} from "@/lib/cash";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";

type ModalMode = "open" | "close" | "manual_in" | "manual_out" | null;

function formatRwf(value: number) {
  return `Rwf ${Number(value || 0).toLocaleString("en-US")}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";

  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTodayBusinessDate() {
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

export default function CashPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [businessDate, setBusinessDate] = useState(getTodayBusinessDate());
  const [session, setSession] = useState<CashSession | null>(null);
  const [totals, setTotals] = useState<CashTotals>(emptyTotals);
  const [ledger, setLedger] = useState<MoneyLedgerEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [modalMode, setModalMode] = useState<ModalMode>(null);

  const [openingFloatRwf, setOpeningFloatRwf] = useState("0");
  const [countedCashRwf, setCountedCashRwf] = useState("0");
  const [movementAmountRwf, setMovementAmountRwf] = useState("0");
  const [movementMethod, setMovementMethod] = useState<MoneyMethod>("cash");
  const [movementCategory, setMovementCategory] = useState("");
  const [notes, setNotes] = useState("");

  const canOpenCash = hasPermission(user, "cash.receivePayment");
  const canCloseDay = hasPermission(user, "cash.closeDay");
  const canViewDifference = hasPermission(user, "cash.viewDifference");

  const isOwner = user?.role === "owner";
  const isOpen = session?.status === "open";
  const isClosed = session?.status === "closed";
  const hasNoSession = !session;

  const cashDifferencePreview = useMemo(() => {
    return Number(countedCashRwf || 0) - Number(totals.expectedCashRwf || 0);
  }, [countedCashRwf, totals.expectedCashRwf]);

  const moneyInRows = useMemo(
    () => ledger.filter((entry) => entry.direction === "money_in"),
    [ledger],
  );

  const moneyOutRows = useMemo(
    () => ledger.filter((entry) => entry.direction === "money_out"),
    [ledger],
  );

  useEffect(() => {
    loadCash();
  }, []);

  async function loadCash(nextDate = businessDate) {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setMessage("");

    try {
      const [meResponse, cashResponse] = await Promise.all([
        getCurrentUser(token),
        getCashToday(token, nextDate),
      ]);

      setUser(meResponse.user);
      setBusinessDate(cashResponse.businessDate);
      setSession(cashResponse.session);
      setTotals(cashResponse.totals);
      setLedger(cashResponse.ledger);
      setCountedCashRwf(String(cashResponse.totals.expectedCashRwf || 0));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load cash.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetModal() {
    setOpeningFloatRwf("0");
    setCountedCashRwf(String(totals.expectedCashRwf || 0));
    setMovementAmountRwf("0");
    setMovementMethod("cash");
    setMovementCategory("");
    setNotes("");
    setSaving(false);
  }

  function openModal(mode: ModalMode) {
    resetModal();

    if (mode === "manual_in") {
      setMovementCategory("owner_money_in");
    }

    if (mode === "manual_out") {
      setMovementCategory("owner_money_out");
    }

    setModalMode(mode);
  }

  function closeModal() {
    setModalMode(null);
    resetModal();
  }

  async function handleOpenCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token) return;

    setSaving(true);
    setMessage("");

    try {
      await openCashSession(token, {
        businessDate,
        openingFloatRwf: Number(openingFloatRwf || 0),
        notes,
      });

      closeModal();
      await loadCash(businessDate);
      setMessage("Cash session opened successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not open cash session.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleReopenCash() {
    if (!isOwner) {
      setMessage("Only the owner can reopen a closed cash session.");
      return;
    }

    if (!isClosed) {
      setMessage("Only a closed cash session can be reopened.");
      return;
    }

    const token = getToken();
    if (!token) return;

    setSaving(true);
    setMessage("");

    try {
      await reopenCashSession(token, {
        businessDate,
        notes: "Owner reopened the cash session.",
      });

      await loadCash(businessDate);
      setMessage("Cash session reopened successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not reopen cash session.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token) return;

    setSaving(true);
    setMessage("");

    try {
      await closeCashSession(token, {
        businessDate,
        countedCashRwf: Number(countedCashRwf || 0),
        notes,
      });

      closeModal();
      await loadCash(businessDate);
      setMessage("Cash session closed successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not close cash session.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleManualMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token || !modalMode) return;

    if (!isOpen) {
      setMessage("Cash session must be open before recording money movement.");
      return;
    }

    const direction: ManualMoneyMovementInput["direction"] =
      modalMode === "manual_out" ? "money_out" : "money_in";

    setSaving(true);
    setMessage("");

    try {
      await createManualMoneyMovement(token, {
        businessDate,
        direction,
        amountRwf: Number(movementAmountRwf || 0),
        method: movementMethod,
        category: movementCategory,
        description: notes,
      });

      closeModal();
      await loadCash(businessDate);
      setMessage(
        direction === "money_in"
          ? "Money in recorded successfully."
          : "Money out recorded successfully.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not record money movement.",
      );
    } finally {
      setSaving(false);
    }
  }

  const modalTitle =
    modalMode === "open"
      ? "Open cash session"
      : modalMode === "close"
        ? "Close day"
        : modalMode === "manual_in"
          ? "Record money in"
          : modalMode === "manual_out"
            ? "Record money out"
            : "";

  const modalDescription =
    modalMode === "open"
      ? "Start today’s cash drawer with an opening float."
      : modalMode === "close"
        ? "Count the physical cash and compare it with expected cash."
        : modalMode === "manual_in"
          ? "Record extra money entering the shop outside sales."
          : modalMode === "manual_out"
            ? "Record money leaving the shop before expenses module is finished."
            : "";

  return (
    <AppShell title="Cash">
      <section className="dashboard-hero">
        <div>
          <span className="hero-kicker dashboard-kicker">
            <WalletCards size={15} />
            Money control
          </span>

          <h1>Cash handling</h1>

          <p>
            Track money in, money out, payment methods, expected cash, counted
            cash, and daily cash difference.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <input
            type="date"
            value={businessDate}
            onChange={(event) => {
              setBusinessDate(event.target.value);
              loadCash(event.target.value);
            }}
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

          <button
            className="btn btn-outline"
            type="button"
            onClick={() => loadCash(businessDate)}
          >
            <RefreshCw size={14} />
            Refresh
          </button>

          {hasNoSession && canOpenCash ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => openModal("open")}
            >
              <Plus size={14} />
              Open cash
            </button>
          ) : null}

          {isOpen && canCloseDay ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => openModal("close")}
            >
              <LockKeyhole size={14} />
              Close day
            </button>
          ) : null}

          {isClosed && isOwner ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleReopenCash}
              disabled={saving}
            >
              <RefreshCw size={14} />
              Reopen cash
            </button>
          ) : null}
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

      {isClosed && !isOwner ? (
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
          This cash session is closed. Only the owner can reopen it.
        </div>
      ) : null}

      <div className="premium-stats-grid">
        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <Banknote size={20} />
            </div>
            <span
              className={
                isOpen
                  ? "badge badge-green"
                  : isClosed
                    ? "badge badge-blue"
                    : "badge badge-orange"
              }
            >
              {session ? session.status : "Not opened"}
            </span>
          </div>

          <div className="stat-label">Cash session</div>
          <div className="stat-value" style={{ fontSize: 24 }}>
            {session ? session.businessDate : businessDate}
          </div>
          <div className="stat-help">
            {session
              ? `Opened ${formatDateTime(session.openedAt)}`
              : "Open cash before daily selling"}
          </div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <ArrowUpRight size={20} />
            </div>
            <span className="badge badge-green">Money in</span>
          </div>

          <div className="stat-label">Total money in</div>
          <div className="stat-value" style={{ fontSize: 24 }}>
            {formatRwf(totals.moneyInRwf)}
          </div>
          <div className="stat-help">
            {moneyInRows.length} money-in record(s)
          </div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <ArrowDownLeft size={20} />
            </div>
            <span className="badge badge-orange">Money out</span>
          </div>

          <div className="stat-label">Total money out</div>
          <div className="stat-value" style={{ fontSize: 24 }}>
            {formatRwf(totals.moneyOutRwf)}
          </div>
          <div className="stat-help">
            {moneyOutRows.length} money-out record(s)
          </div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <Coins size={20} />
            </div>
            <span className="badge badge-blue">Expected</span>
          </div>

          <div className="stat-label">Expected cash</div>
          <div className="stat-value" style={{ fontSize: 24 }}>
            {formatRwf(totals.expectedCashRwf)}
          </div>
          <div className="stat-help">Opening float + cash in - cash out</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="table-card premium-panel">
          <div className="table-card-header">
            <div>
              <div className="table-title">Payment method summary</div>
              <div className="app-subtitle">
                See how money entered or left the shop today.
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

          <div className="attention-list">
            <div className="attention-item">
              <Banknote size={17} />
              <div>
                <strong>Cash</strong>
                <span>
                  In: {formatRwf(totals.cashInRwf)} · Out:{" "}
                  {formatRwf(totals.cashOutRwf)}
                </span>
              </div>
            </div>

            <div className="attention-item">
              <WalletCards size={17} />
              <div>
                <strong>MoMo</strong>
                <span>
                  In: {formatRwf(totals.momoInRwf)} · Out:{" "}
                  {formatRwf(totals.momoOutRwf)}
                </span>
              </div>
            </div>

            <div className="attention-item">
              <ReceiptText size={17} />
              <div>
                <strong>Bank / Card / Other</strong>
                <span>
                  Bank in: {formatRwf(totals.bankInRwf)} · Card in:{" "}
                  {formatRwf(totals.cardInRwf)} · Other in:{" "}
                  {formatRwf(totals.otherInRwf)}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="table-card premium-panel">
          <div className="table-card-header">
            <div>
              <div className="table-title">Daily actions</div>
              <div className="app-subtitle">
                Use this for owner money in/out and daily closing.
              </div>
            </div>
          </div>

          <div className="quick-actions-grid">
            {hasNoSession && canOpenCash ? (
              <button
                className="quick-action"
                type="button"
                onClick={() => openModal("open")}
              >
                <PlusCircle size={18} />
                <span>Open cash</span>
                <small>Start day with float</small>
              </button>
            ) : null}

            {isOpen && canCloseDay ? (
              <>
                <button
                  className="quick-action"
                  type="button"
                  onClick={() => openModal("manual_in")}
                >
                  <ArrowUpRight size={18} />
                  <span>Money in</span>
                  <small>Owner adds cash</small>
                </button>

                <button
                  className="quick-action"
                  type="button"
                  onClick={() => openModal("manual_out")}
                >
                  <ArrowDownLeft size={18} />
                  <span>Money out</span>
                  <small>Owner removes cash</small>
                </button>

                <button
                  className="quick-action"
                  type="button"
                  onClick={() => openModal("close")}
                >
                  <LockKeyhole size={18} />
                  <span>Close day</span>
                  <small>Compare counted cash</small>
                </button>
              </>
            ) : null}

            {isClosed ? (
              <>
                <div className="quick-action" style={{ cursor: "default" }}>
                  <CheckCircle2 size={18} />
                  <span>Day closed</span>
                  <small>
                    Difference:{" "}
                    {canViewDifference || isOwner
                      ? formatRwf(session?.differenceRwf || 0)
                      : "Hidden"}
                  </small>
                </div>

                {isOwner ? (
                  <button
                    className="quick-action"
                    type="button"
                    onClick={handleReopenCash}
                    disabled={saving}
                  >
                    <RefreshCw size={18} />
                    <span>Reopen cash</span>
                    <small>Owner correction only</small>
                  </button>
                ) : null}
              </>
            ) : null}

            {!canCloseDay && session ? (
              <div className="quick-action" style={{ cursor: "default" }}>
                <ShieldCheck size={18} />
                <span>View only</span>
                <small>You do not have close-day permission</small>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {session ? (
        <section className="table-card premium-panel" style={{ marginTop: 18 }}>
          <div className="table-card-header">
            <div>
              <div className="table-title">Cash session proof</div>
              <div className="app-subtitle">
                Opening float, expected cash, counted cash, and difference.
              </div>
            </div>

            <span
              className={
                session.status === "closed"
                  ? "badge badge-blue"
                  : "badge badge-green"
              }
            >
              {session.status}
            </span>
          </div>

          <div className="tbl-overflow">
            <table className="simple-table">
              <tbody>
                <tr>
                  <td>Opening float</td>
                  <td>{formatRwf(session.openingFloatRwf)}</td>
                </tr>
                <tr>
                  <td>Expected cash</td>
                  <td>{formatRwf(totals.expectedCashRwf)}</td>
                </tr>
                <tr>
                  <td>Counted cash</td>
                  <td>
                    {session.countedCashRwf === null
                      ? "Not counted yet"
                      : formatRwf(session.countedCashRwf)}
                  </td>
                </tr>
                <tr>
                  <td>Difference</td>
                  <td>
                    {canViewDifference || isOwner
                      ? formatRwf(session.differenceRwf)
                      : "Hidden"}
                  </td>
                </tr>
                <tr>
                  <td>Opened at</td>
                  <td>{formatDateTime(session.openedAt)}</td>
                </tr>
                <tr>
                  <td>Closed at</td>
                  <td>{formatDateTime(session.closedAt)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="table-card premium-panel" style={{ marginTop: 18 }}>
        <div className="table-card-header">
          <div>
            <div className="table-title">Money ledger</div>
            <div className="app-subtitle">
              Every sale payment, deposit, debt payment, installment, expense,
              and manual money movement should appear here.
            </div>
          </div>

          <span className="badge badge-blue">{ledger.length} record(s)</span>
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
                <th>Source</th>
                <th>Actor</th>
              </tr>
            </thead>

            <tbody>
              {ledger.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.happenedAt)}</td>
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
                      {entry.direction === "money_in" ? (
                        <ArrowUpRight size={12} />
                      ) : entry.direction === "money_out" ? (
                        <ArrowDownLeft size={12} />
                      ) : (
                        <MinusCircle size={12} />
                      )}
                      {entry.direction}
                    </span>
                  </td>
                  <td>
                    <strong style={{ color: "var(--gray-900)" }}>
                      {formatRwf(entry.amountRwf)}
                    </strong>
                  </td>
                  <td>{entry.method}</td>
                  <td>
                    <span className="badge badge-blue">{entry.category}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 800, color: "var(--gray-700)" }}>
                      {entry.sourceType}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: "var(--gray-400)",
                        fontWeight: 800,
                      }}
                    >
                      {entry.description || "No description"}
                    </div>
                  </td>
                  <td>{entry.actorName || "Unknown"}</td>
                </tr>
              ))}

              {ledger.length === 0 ? (
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
                      No money movement recorded for this date yet.
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {modalMode ? (
        <div className="staff-modal-backdrop">
          <div className="staff-modal">
            <div className="staff-modal-header">
              <div>
                <div className="staff-modal-icon">
                  {modalMode === "open" ? (
                    <PlusCircle size={22} />
                  ) : modalMode === "close" ? (
                    <LockKeyhole size={22} />
                  ) : modalMode === "manual_in" ? (
                    <ArrowUpRight size={22} />
                  ) : (
                    <ArrowDownLeft size={22} />
                  )}
                </div>

                <h2>{modalTitle}</h2>
                <p>{modalDescription}</p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="staff-modal-close"
              >
                <X size={18} />
              </button>
            </div>

            {modalMode === "open" ? (
              <form onSubmit={handleOpenCash} className="staff-modal-body">
                <div className="staff-form-grid">
                  <label className="staff-form-group">
                    <span>Business date</span>
                    <input
                      type="date"
                      value={businessDate}
                      onChange={(event) => setBusinessDate(event.target.value)}
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Opening float</span>
                    <input
                      type="number"
                      min={0}
                      value={openingFloatRwf}
                      onChange={(event) =>
                        setOpeningFloatRwf(event.target.value)
                      }
                    />
                  </label>
                </div>

                <label className="staff-form-group">
                  <span>Notes</span>
                  <input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Example: Opening cash drawer for today."
                  />
                </label>

                <ModalFooter
                  saving={saving}
                  onCancel={closeModal}
                  label="Open cash"
                />
              </form>
            ) : null}

            {modalMode === "close" ? (
              <form onSubmit={handleCloseCash} className="staff-modal-body">
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    padding: 16,
                    background: "var(--gray-50)",
                  }}
                >
                  <div className="staff-form-section-title">
                    System expected cash
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      color: "var(--gray-900)",
                      fontSize: 26,
                      fontWeight: 900,
                    }}
                  >
                    {formatRwf(totals.expectedCashRwf)}
                  </div>
                  <p
                    style={{
                      marginTop: 6,
                      color: "var(--gray-500)",
                      fontWeight: 750,
                    }}
                  >
                    Opening float + cash received - cash removed.
                  </p>
                </div>

                <div className="staff-form-grid">
                  <label className="staff-form-group">
                    <span>Counted physical cash</span>
                    <input
                      type="number"
                      min={0}
                      value={countedCashRwf}
                      onChange={(event) =>
                        setCountedCashRwf(event.target.value)
                      }
                    />
                  </label>

                  <div>
                    <div className="staff-form-section-title">Difference</div>
                    <div
                      style={{
                        marginTop: 8,
                        color:
                          cashDifferencePreview === 0
                            ? "var(--green)"
                            : "var(--red)",
                        fontSize: 22,
                        fontWeight: 900,
                      }}
                    >
                      {formatRwf(cashDifferencePreview)}
                    </div>
                  </div>
                </div>

                <label className="staff-form-group">
                  <span>Closing notes</span>
                  <input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Example: Closing cash drawer."
                  />
                </label>

                <ModalFooter
                  saving={saving}
                  onCancel={closeModal}
                  label="Close day"
                />
              </form>
            ) : null}

            {modalMode === "manual_in" || modalMode === "manual_out" ? (
              <form
                onSubmit={handleManualMovement}
                className="staff-modal-body"
              >
                <div className="staff-form-grid">
                  <label className="staff-form-group">
                    <span>Amount</span>
                    <input
                      type="number"
                      min={1}
                      value={movementAmountRwf}
                      onChange={(event) =>
                        setMovementAmountRwf(event.target.value)
                      }
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Method</span>
                    <select
                      value={movementMethod}
                      onChange={(event) =>
                        setMovementMethod(event.target.value as MoneyMethod)
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
                    <span>Category</span>
                    <input
                      value={movementCategory}
                      onChange={(event) =>
                        setMovementCategory(event.target.value)
                      }
                      placeholder="Example: owner_money_in"
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Business date</span>
                    <input
                      type="date"
                      value={businessDate}
                      onChange={(event) => setBusinessDate(event.target.value)}
                    />
                  </label>
                </div>

                <label className="staff-form-group">
                  <span>Description</span>
                  <input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Example: Owner added extra cash to drawer."
                  />
                </label>

                <ModalFooter
                  saving={saving}
                  onCancel={closeModal}
                  label={
                    modalMode === "manual_in"
                      ? "Record money in"
                      : "Record money out"
                  }
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
};

function ModalFooter({ saving, onCancel, label }: ModalFooterProps) {
  return (
    <div className="staff-modal-footer">
      <button
        type="button"
        onClick={onCancel}
        className="staff-btn staff-btn-outline"
      >
        Cancel
      </button>

      <AsyncButton loading={saving} type="submit">
        <Plus size={15} />
        {label}
      </AsyncButton>
    </div>
  );
}
