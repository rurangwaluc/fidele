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
  Search,
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
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import styles from "./page.module.css";

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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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

  const [ledgerSearch, setLedgerSearch] = useState("");
  const [visibleLedgerCount, setVisibleLedgerCount] = useState(10);

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

  const netMoneyMovement = useMemo(
    () => Number(totals.moneyInRwf || 0) - Number(totals.moneyOutRwf || 0),
    [totals.moneyInRwf, totals.moneyOutRwf],
  );

  const filteredLedger = useMemo(() => {
    const term = ledgerSearch.trim().toLowerCase();

    if (!term) return ledger;

    return ledger.filter((entry) => {
      const direction = (entry.direction || "").toLowerCase();
      const method = (entry.method || "").toLowerCase();
      const category = (entry.category || "").toLowerCase();
      const sourceType = (entry.sourceType || "").toLowerCase();
      const description = (entry.description || "").toLowerCase();
      const actorName = (entry.actorName || "").toLowerCase();
      const amount = String(entry.amountRwf || "");

      return (
        direction.includes(term) ||
        method.includes(term) ||
        category.includes(term) ||
        sourceType.includes(term) ||
        description.includes(term) ||
        actorName.includes(term) ||
        amount.includes(term)
      );
    });
  }, [ledger, ledgerSearch]);

  const visibleLedger = useMemo(
    () => filteredLedger.slice(0, visibleLedgerCount),
    [filteredLedger, visibleLedgerCount],
  );

  const hasMoreLedger = visibleLedgerCount < filteredLedger.length;

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
      setVisibleLedgerCount(10);
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
      <div className={styles.cashPage}>
        <section className={`dashboard-hero ${styles.hero}`}>
          <div className={styles.heroCopy}>
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

          <div className={`dashboard-hero-actions ${styles.heroActions}`}>
            <input
              className={styles.dateInput}
              type="date"
              value={businessDate}
              onChange={(event) => {
                setBusinessDate(event.target.value);
                loadCash(event.target.value);
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

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        {isClosed && !isOwner ? (
          <div className={styles.noticeCard}>
            <div className={styles.noticeContent}>
              <LockKeyhole size={20} />
              <div>
                <strong>Cash session is closed</strong>
                <p>
                  This cash session is closed. Only the owner can reopen it.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.metricsGrid}>
          <MetricCard
            icon={<Banknote size={20} />}
            label="Cash session"
            value={session ? session.businessDate : businessDate}
            help={
              session
                ? `Opened ${formatDateTime(session.openedAt)}`
                : "Open cash before daily selling"
            }
            badge={session ? session.status : "Not opened"}
            badgeClass={
              isOpen
                ? "badge badge-green"
                : isClosed
                  ? "badge badge-blue"
                  : "badge badge-orange"
            }
          />

          <MetricCard
            icon={<ArrowUpRight size={20} />}
            label="Total money in"
            value={formatRwf(totals.moneyInRwf)}
            help={`${moneyInRows.length} money-in record(s)`}
            badge="Money in"
            badgeClass="badge badge-green"
          />

          <MetricCard
            icon={<ArrowDownLeft size={20} />}
            label="Total money out"
            value={formatRwf(totals.moneyOutRwf)}
            help={`${moneyOutRows.length} money-out record(s)`}
            badge="Money out"
            badgeClass="badge badge-orange"
          />

          <MetricCard
            icon={<Coins size={20} />}
            label="Expected cash"
            value={formatRwf(totals.expectedCashRwf)}
            help="Opening float + cash in - cash out"
            badge="Expected"
            badgeClass="badge badge-blue"
          />
        </div>

        <div className={styles.mainGrid}>
          <section className={`table-card premium-panel ${styles.panel}`}>
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

            <div className={styles.methodGrid}>
              <MethodCard
                icon={<Banknote size={17} />}
                label="Cash"
                moneyIn={totals.cashInRwf}
                moneyOut={totals.cashOutRwf}
              />

              <MethodCard
                icon={<WalletCards size={17} />}
                label="MoMo"
                moneyIn={totals.momoInRwf}
                moneyOut={totals.momoOutRwf}
              />

              <MethodCard
                icon={<ReceiptText size={17} />}
                label="Bank"
                moneyIn={totals.bankInRwf}
                moneyOut={totals.bankOutRwf}
              />

              <MethodCard
                icon={<CreditIcon />}
                label="Card / Other"
                moneyIn={totals.cardInRwf + totals.otherInRwf}
                moneyOut={totals.cardOutRwf + totals.otherOutRwf}
              />
            </div>
          </section>

          <section className={`table-card premium-panel ${styles.panel}`}>
            <div className="table-card-header">
              <div>
                <div className="table-title">Daily actions</div>
                <div className="app-subtitle">
                  Use this for owner money in/out and daily closing.
                </div>
              </div>
            </div>

            <div className={styles.quickGrid}>
              {hasNoSession && canOpenCash ? (
                <button
                  className={styles.quickAction}
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
                    className={styles.quickAction}
                    type="button"
                    onClick={() => openModal("manual_in")}
                  >
                    <ArrowUpRight size={18} />
                    <span>Money in</span>
                    <small>Owner adds cash</small>
                  </button>

                  <button
                    className={styles.quickAction}
                    type="button"
                    onClick={() => openModal("manual_out")}
                  >
                    <ArrowDownLeft size={18} />
                    <span>Money out</span>
                    <small>Owner removes cash</small>
                  </button>

                  <button
                    className={styles.quickAction}
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
                  <div className={styles.quickActionStatic}>
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
                      className={styles.quickAction}
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
                <div className={styles.quickActionStatic}>
                  <ShieldCheck size={18} />
                  <span>View only</span>
                  <small>You do not have close-day permission</small>
                </div>
              ) : null}

              {!session ? (
                <div className={styles.quickActionStatic}>
                  <ShieldCheck size={18} />
                  <span>Waiting to open</span>
                  <small>Cash must be opened before selling</small>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        {session ? (
          <section className={`table-card premium-panel ${styles.proofPanel}`}>
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

            <div className={styles.proofGrid}>
              <ProofItem
                label="Opening float"
                value={formatRwf(session.openingFloatRwf)}
              />

              <ProofItem
                label="Expected cash"
                value={formatRwf(totals.expectedCashRwf)}
              />

              <ProofItem
                label="Counted cash"
                value={
                  session.countedCashRwf === null
                    ? "Not counted yet"
                    : formatRwf(session.countedCashRwf)
                }
              />

              <ProofItem
                label="Difference"
                value={
                  canViewDifference || isOwner
                    ? formatRwf(session.differenceRwf || 0)
                    : "Hidden"
                }
                tone={
                  !canViewDifference && !isOwner
                    ? "default"
                    : Number(session.differenceRwf || 0) === 0
                      ? "success"
                      : "warning"
                }
              />

              <ProofItem
                label="Opened at"
                value={formatDateTime(session.openedAt)}
              />

              <ProofItem
                label="Closed at"
                value={formatDateTime(session.closedAt)}
              />

              <ProofItem
                label="Net money movement"
                value={formatRwf(netMoneyMovement)}
                tone={netMoneyMovement >= 0 ? "success" : "warning"}
              />
            </div>
          </section>
        ) : null}

        <section className={`table-card premium-panel ${styles.ledgerPanel}`}>
          <div className="table-card-header">
            <div>
              <div className="table-title">Money ledger</div>
              <div className="app-subtitle">
                Every sale payment, deposit, debt payment, installment, expense,
                and manual money movement should appear here.
              </div>
            </div>

            <span className="badge badge-blue">
              {filteredLedger.length} record(s)
            </span>
          </div>

          <div className={styles.ledgerToolbar}>
            <div className="hdr-search">
              <Search size={14} />
              <input
                value={ledgerSearch}
                onChange={(event) => {
                  setLedgerSearch(event.target.value);
                  setVisibleLedgerCount(10);
                }}
                placeholder="Search method, category, source, actor..."
              />
            </div>

            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                setLedgerSearch("");
                setVisibleLedgerCount(10);
              }}
            >
              Clear
            </button>
          </div>

          <div className={styles.ledgerList}>
            {visibleLedger.map((entry) => (
              <LedgerCard key={entry.id} entry={entry} />
            ))}

            {filteredLedger.length === 0 ? (
              <div className={styles.emptyState}>
                <WalletCards size={22} />
                <strong>No money movement found</strong>
                <span>
                  Money movement records will appear after sales, payments,
                  expenses, or manual cash actions.
                </span>
              </div>
            ) : null}
          </div>

          {hasMoreLedger ? (
            <div className={styles.loadMoreBox}>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setVisibleLedgerCount((current) => current + 10)}
              >
                Load more ledger records
              </button>
            </div>
          ) : null}
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
                        onChange={(event) =>
                          setBusinessDate(event.target.value)
                        }
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
                  <div className={styles.expectedCashBox}>
                    <div className="staff-form-section-title">
                      System expected cash
                    </div>
                    <strong>{formatRwf(totals.expectedCashRwf)}</strong>
                    <p>Opening float + cash received - cash removed.</p>
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

                    <div className={styles.differencePreview}>
                      <span>Difference</span>
                      <strong
                        className={
                          cashDifferencePreview === 0
                            ? styles.goodDifference
                            : styles.badDifference
                        }
                      >
                        {formatRwf(cashDifferencePreview)}
                      </strong>
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
                        onChange={(event) =>
                          setBusinessDate(event.target.value)
                        }
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

type MethodCardProps = {
  icon: ReactNode;
  label: string;
  moneyIn: number;
  moneyOut: number;
};

function MethodCard({ icon, label, moneyIn, moneyOut }: MethodCardProps) {
  return (
    <div className={styles.methodCard}>
      <div className={styles.methodTop}>
        <div className={styles.methodIcon}>{icon}</div>
        <strong>{label}</strong>
      </div>

      <div className={styles.methodMoneyGrid}>
        <MiniMoney label="In" value={formatRwf(moneyIn)} tone="in" />
        <MiniMoney label="Out" value={formatRwf(moneyOut)} tone="out" />
      </div>
    </div>
  );
}

type MiniMoneyProps = {
  label: string;
  value: string;
  tone?: "default" | "in" | "out";
};

function MiniMoney({ label, value, tone = "default" }: MiniMoneyProps) {
  return (
    <div
      className={cx(
        styles.miniMoney,
        tone === "in" && styles.miniMoneyIn,
        tone === "out" && styles.miniMoneyOut,
      )}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type ProofItemProps = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
};

function ProofItem({ label, value, tone = "default" }: ProofItemProps) {
  return (
    <div
      className={cx(
        styles.proofItem,
        tone === "success" && styles.proofItemSuccess,
        tone === "warning" && styles.proofItemWarning,
      )}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type LedgerCardProps = {
  entry: MoneyLedgerEntry;
};

function LedgerCard({ entry }: LedgerCardProps) {
  const isMoneyIn = entry.direction === "money_in";
  const isMoneyOut = entry.direction === "money_out";

  return (
    <article className={styles.ledgerCard}>
      <div className={styles.ledgerTop}>
        <div className={styles.ledgerIdentity}>
          <div
            className={cx(
              styles.ledgerIcon,
              isMoneyIn && styles.ledgerIconIn,
              isMoneyOut && styles.ledgerIconOut,
            )}
          >
            {isMoneyIn ? (
              <ArrowUpRight size={17} />
            ) : isMoneyOut ? (
              <ArrowDownLeft size={17} />
            ) : (
              <MinusCircle size={17} />
            )}
          </div>

          <div>
            <h3>{formatRwf(entry.amountRwf)}</h3>
            <p>{formatDateTime(entry.happenedAt)}</p>
          </div>
        </div>

        <span
          className={
            isMoneyIn
              ? "badge badge-green"
              : isMoneyOut
                ? "badge badge-orange"
                : "badge badge-blue"
          }
        >
          {entry.direction}
        </span>
      </div>

      <div className={styles.ledgerInfoGrid}>
        <ProofItem label="Method" value={entry.method} />
        <ProofItem label="Category" value={entry.category} />
        <ProofItem label="Source" value={entry.sourceType} />
        <ProofItem label="Actor" value={entry.actorName || "Unknown"} />
      </div>

      <div className={styles.ledgerDescription}>
        <span>Description</span>
        <strong>{entry.description || "No description"}</strong>
      </div>
    </article>
  );
}

function CreditIcon() {
  return <ReceiptText size={17} />;
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
