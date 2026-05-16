"use client";

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  WalletCards,
  X,
} from "lucide-react";
import { CashSession, getCashToday } from "@/lib/cash";
import {
  CustomerDebt,
  CustomerDebtInstallment,
  getDebts,
  recordDebtPayment,
} from "@/lib/debts";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import { SalePaymentMethod } from "@/lib/sales";
import { getToken } from "@/lib/auth";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";

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

function isOverdue(value: string | null) {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function DebtsPage() {
  const router = useRouter();

  const [debts, setDebts] = useState<CustomerDebt[]>([]);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [visibleDebtsCount, setVisibleDebtsCount] = useState(8);
  const [visibleInstallmentPlansCount, setVisibleInstallmentPlansCount] =
    useState(6);

  const [selectedDebt, setSelectedDebt] = useState<CustomerDebt | null>(null);
  const [selectedInstallment, setSelectedInstallment] =
    useState<CustomerDebtInstallment | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [amountRwf, setAmountRwf] = useState("");
  const [method, setMethod] = useState<SalePaymentMethod>("cash");
  const [note, setNote] = useState("");

  const isCashOpen = cashSession?.status === "open";

  const cashMessage = !cashSession
    ? "Cash session is not open. Open cash before receiving debt or installment payments."
    : cashSession.status === "closed"
      ? "Cash session is closed. Debt and installment payments are blocked for this business date."
      : "";

  const pendingDebts = useMemo(
    () => debts.filter((debt) => debt.balanceRwf > 0),
    [debts],
  );

  const paidDebts = useMemo(
    () => debts.filter((debt) => debt.balanceRwf <= 0),
    [debts],
  );

  const totalDebtBalance = useMemo(
    () => debts.reduce((sum, debt) => sum + Number(debt.balanceRwf || 0), 0),
    [debts],
  );

  const totalDebtOriginal = useMemo(
    () =>
      debts.reduce((sum, debt) => sum + Number(debt.originalAmountRwf || 0), 0),
    [debts],
  );

  const installmentDebts = useMemo(
    () => debts.filter((debt) => (debt.installments || []).length > 0),
    [debts],
  );

  const overdueInstallments = useMemo(() => {
    return debts.flatMap((debt) =>
      (debt.installments || []).filter(
        (installment) =>
          installment.balanceRwf > 0 && isOverdue(installment.dueAt),
      ),
    );
  }, [debts]);

  const filteredDebts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return debts;

    return debts.filter((debt) => {
      const customerName = (debt.customerName || "").toLowerCase();
      const customerPhone = (debt.customerPhone || "").toLowerCase();
      const saleNumber = (debt.saleNumber || "").toLowerCase();
      const status = (debt.status || "").toLowerCase();

      return (
        customerName.includes(term) ||
        customerPhone.includes(term) ||
        saleNumber.includes(term) ||
        status.includes(term)
      );
    });
  }, [debts, search]);

  const filteredInstallmentDebts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return installmentDebts;

    return installmentDebts.filter((debt) => {
      const customerName = (debt.customerName || "").toLowerCase();
      const customerPhone = (debt.customerPhone || "").toLowerCase();
      const saleNumber = (debt.saleNumber || "").toLowerCase();

      const installmentMatch = (debt.installments || []).some(
        (installment) =>
          String(installment.installmentNumber).includes(term) ||
          (installment.status || "").toLowerCase().includes(term) ||
          formatDate(installment.dueAt).toLowerCase().includes(term),
      );

      return (
        customerName.includes(term) ||
        customerPhone.includes(term) ||
        saleNumber.includes(term) ||
        installmentMatch
      );
    });
  }, [installmentDebts, search]);

  const visibleDebts = useMemo(
    () => filteredDebts.slice(0, visibleDebtsCount),
    [filteredDebts, visibleDebtsCount],
  );

  const visibleInstallmentDebts = useMemo(
    () => filteredInstallmentDebts.slice(0, visibleInstallmentPlansCount),
    [filteredInstallmentDebts, visibleInstallmentPlansCount],
  );

  const hasMoreDebts = visibleDebtsCount < filteredDebts.length;

  const hasMoreInstallmentPlans =
    visibleInstallmentPlansCount < filteredInstallmentDebts.length;

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setMessage("");

    try {
      const [debtsResponse, cashResponse] = await Promise.all([
        getDebts(token),
        getCashToday(token),
      ]);

      setDebts(debtsResponse.debts);
      setCashSession(cashResponse.session);
      setVisibleDebtsCount(8);
      setVisibleInstallmentPlansCount(6);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load debts.",
      );
    } finally {
      setLoading(false);
    }
  }

  function openPaymentModal(
    debt: CustomerDebt,
    installment?: CustomerDebtInstallment,
  ) {
    if (!isCashOpen) {
      setMessage(cashMessage || "Open cash before receiving payments.");
      return;
    }

    setSelectedDebt(debt);
    setSelectedInstallment(installment || null);

    if (installment) {
      setAmountRwf(String(installment.balanceRwf));
      setNote(`Payment for installment ${installment.installmentNumber}.`);
    } else {
      setAmountRwf(String(debt.balanceRwf));
      setNote("Customer came back and paid.");
    }

    setMethod("cash");
    setPaymentModalOpen(true);
  }

  function closePaymentModal() {
    setSelectedDebt(null);
    setSelectedInstallment(null);
    setAmountRwf("");
    setMethod("cash");
    setNote("");
    setSaving(false);
    setPaymentModalOpen(false);
  }

  async function handleRecordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isCashOpen) {
      setMessage(cashMessage || "Open cash before receiving payments.");
      return;
    }

    const token = getToken();
    if (!token || !selectedDebt) return;

    const amount = Number(amountRwf || 0);

    if (amount <= 0) {
      setMessage("Payment amount must be greater than zero.");
      return;
    }

    if (amount > selectedDebt.balanceRwf) {
      setMessage("Payment cannot be greater than remaining debt balance.");
      return;
    }

    if (selectedInstallment && amount > selectedInstallment.balanceRwf) {
      setMessage(
        "Payment cannot be greater than selected installment balance.",
      );
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await recordDebtPayment(token, selectedDebt.id, {
        amountRwf: amount,
        method,
        note,
        installmentId: selectedInstallment?.id,
      });

      closePaymentModal();
      await loadData();
      setMessage("Debt payment recorded successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not record debt payment.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Debts">
      <div className={styles.debtsPage}>
        <section className={`dashboard-hero ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className="hero-kicker dashboard-kicker">
              <WalletCards size={15} />
              Customer debts
            </span>

            <h1>Pay-later and installments</h1>

            <p>
              Track customers who took products and promised to pay later.
              Record full, partial, or installment payments here.
            </p>
          </div>

          <div className={`dashboard-hero-actions ${styles.heroActions}`}>
            <button
              className="btn btn-outline"
              type="button"
              onClick={loadData}
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
          </div>
        </section>

        {!isCashOpen ? (
          <NoticeCard
            title="Payment receiving is blocked"
            text={cashMessage}
            actionLabel={cashSession ? "View cash" : "Open cash"}
            onAction={() => router.push("/cash")}
          />
        ) : null}

        <div className={styles.metricsGrid}>
          <MetricCard
            icon={<WalletCards size={20} />}
            label="Open balance"
            value={formatRwf(totalDebtBalance)}
            help="Money customers still owe"
            badge="Balance"
            badgeClass="badge badge-orange"
          />

          <MetricCard
            icon={<Clock size={20} />}
            label="Pending debts"
            value={String(pendingDebts.length)}
            help="Customers who still need to pay"
            badge="Pending"
            badgeClass="badge badge-orange"
          />

          <MetricCard
            icon={<CalendarClock size={20} />}
            label="Installment plans"
            value={String(installmentDebts.length)}
            help={`${overdueInstallments.length} overdue installment(s)`}
            badge="Plans"
            badgeClass="badge badge-blue"
          />

          <MetricCard
            icon={<CreditCard size={20} />}
            label="Original debt amount"
            value={formatRwf(totalDebtOriginal)}
            help={`${paidDebts.length} debt record(s) fully cleared`}
            badge="Total"
            badgeClass="badge badge-blue"
          />
        </div>

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        <section className={`table-card premium-panel ${styles.controlPanel}`}>
          <div className="table-card-header">
            <div>
              <div className="table-title">Debt control</div>
              <div className="app-subtitle">
                Search customer debts and installment plans without horizontal
                scrolling.
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

          <div className={styles.toolbar}>
            <div className="hdr-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleDebtsCount(8);
                  setVisibleInstallmentPlansCount(6);
                }}
                placeholder="Search customer, phone, sale number, status..."
              />
            </div>

            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                setSearch("");
                setVisibleDebtsCount(8);
                setVisibleInstallmentPlansCount(6);
              }}
            >
              Clear
            </button>
          </div>
        </section>

        <section className={`table-card premium-panel ${styles.listPanel}`}>
          <div className="table-card-header">
            <div>
              <div className="table-title">Customer debt list</div>
              <div className="app-subtitle">
                Record full debt payments or pay specific installments.
              </div>
            </div>

            <span className="badge badge-blue">
              {filteredDebts.length} record(s)
            </span>
          </div>

          <div className={styles.debtGrid}>
            {visibleDebts.map((debt) => {
              const installments = debt.installments || [];
              const nextInstallment =
                installments.find(
                  (installment) => installment.balanceRwf > 0,
                ) || null;
              const isPaid = debt.balanceRwf <= 0;

              return (
                <article key={debt.id} className={styles.debtCard}>
                  <div className={styles.debtCardTop}>
                    <div className={styles.debtIdentity}>
                      <div className={styles.cardIcon}>
                        <WalletCards size={18} />
                      </div>

                      <div>
                        <h3>{debt.customerName}</h3>
                        <p>{debt.customerPhone || "No phone"}</p>
                        <span>{debt.saleNumber || "No sale number"}</span>
                      </div>
                    </div>

                    <span
                      className={
                        isPaid ? "badge badge-green" : "badge badge-orange"
                      }
                    >
                      {isPaid ? "Paid" : debt.status}
                    </span>
                  </div>

                  <div className={styles.miniGrid}>
                    <MiniInfo
                      label="Balance"
                      value={formatRwf(debt.balanceRwf)}
                      tone={isPaid ? "success" : "warning"}
                    />

                    <MiniInfo
                      label="Original"
                      value={formatRwf(debt.originalAmountRwf)}
                    />

                    <MiniInfo
                      label="Paid"
                      value={formatRwf(debt.amountPaidRwf)}
                      tone={debt.amountPaidRwf > 0 ? "success" : "default"}
                    />

                    <MiniInfo
                      label="Plan"
                      value={
                        installments.length > 0
                          ? `${installments.length} installment(s)`
                          : "One payment"
                      }
                    />
                  </div>

                  {nextInstallment ? (
                    <div className={styles.nextInstallmentBox}>
                      <CalendarClock size={15} />
                      <div>
                        <strong>
                          Next installment #{nextInstallment.installmentNumber}
                        </strong>
                        <span>
                          {formatRwf(nextInstallment.balanceRwf)} · Due{" "}
                          {formatDate(nextInstallment.dueAt)}
                        </span>
                      </div>
                    </div>
                  ) : installments.length > 0 ? (
                    <div className={styles.nextInstallmentBox}>
                      <CheckCircle2 size={15} />
                      <div>
                        <strong>All installments cleared</strong>
                        <span>No unpaid installment remains.</span>
                      </div>
                    </div>
                  ) : null}

                  <div className={styles.cardFooter}>
                    {debt.balanceRwf > 0 ? (
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        onClick={() => openPaymentModal(debt)}
                        disabled={!isCashOpen}
                      >
                        <Plus size={13} />
                        Record payment
                      </button>
                    ) : (
                      <span className="badge badge-green">Cleared</span>
                    )}
                  </div>
                </article>
              );
            })}

            {filteredDebts.length === 0 ? (
              <EmptyCard
                icon={<WalletCards size={20} />}
                title="No customer debts found"
                text="Create a pay-later or installment sale from the Sell page."
              />
            ) : null}
          </div>

          {hasMoreDebts ? (
            <div className={styles.loadMoreBox}>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setVisibleDebtsCount((current) => current + 8)}
              >
                Load more debts
              </button>
            </div>
          ) : null}
        </section>

        <section className={`table-card premium-panel ${styles.planPanel}`}>
          <div className="table-card-header">
            <div>
              <div className="table-title">Installment schedules</div>
              <div className="app-subtitle">
                Quick view of all installment plans and their payment status.
              </div>
            </div>

            <span className="badge badge-blue">
              {filteredInstallmentDebts.length} plan(s)
            </span>
          </div>

          <div className={styles.planList}>
            {visibleInstallmentDebts.map((debt) => (
              <article key={debt.id} className={styles.planCard}>
                <div className={styles.planCardTop}>
                  <div className={styles.debtIdentity}>
                    <div className={styles.cardIcon}>
                      <CalendarClock size={18} />
                    </div>

                    <div>
                      <h3>{debt.customerName}</h3>
                      <p>{debt.saleNumber || "No sale number"}</p>
                      <span>
                        Balance: {formatRwf(debt.balanceRwf)} · Original:{" "}
                        {formatRwf(debt.originalAmountRwf)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.installmentGrid}>
                  {(debt.installments || []).map((installment) => {
                    const paid = installment.balanceRwf <= 0;
                    const overdue =
                      !paid && isOverdue(installment.dueAt || null);

                    return (
                      <div
                        key={installment.id}
                        className={cx(
                          styles.installmentCard,
                          overdue && styles.installmentCardOverdue,
                          paid && styles.installmentCardPaid,
                        )}
                      >
                        <div className={styles.installmentTop}>
                          <strong>
                            Installment #{installment.installmentNumber}
                          </strong>

                          <span
                            className={
                              paid
                                ? "badge badge-green"
                                : overdue
                                  ? "badge badge-orange"
                                  : "badge badge-blue"
                            }
                          >
                            {paid ? "Paid" : overdue ? "Overdue" : "Open"}
                          </span>
                        </div>

                        <div className={styles.miniGrid}>
                          <MiniInfo
                            label="Expected"
                            value={formatRwf(installment.expectedAmountRwf)}
                          />

                          <MiniInfo
                            label="Balance"
                            value={formatRwf(installment.balanceRwf)}
                            tone={paid ? "success" : "warning"}
                          />

                          <MiniInfo
                            label="Due"
                            value={formatDate(installment.dueAt)}
                          />
                        </div>

                        {installment.balanceRwf > 0 ? (
                          <button
                            className="btn btn-outline btn-sm"
                            type="button"
                            onClick={() => openPaymentModal(debt, installment)}
                            disabled={!isCashOpen}
                          >
                            Pay installment
                          </button>
                        ) : (
                          <span className="badge badge-green">Paid</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}

            {filteredInstallmentDebts.length === 0 ? (
              <EmptyCard
                icon={<CheckCircle2 size={20} />}
                title="No installment plans yet"
                text="Create an installment sale from the Sell page."
              />
            ) : null}
          </div>

          {hasMoreInstallmentPlans ? (
            <div className={styles.loadMoreBox}>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() =>
                  setVisibleInstallmentPlansCount((current) => current + 6)
                }
              >
                Load more installment plans
              </button>
            </div>
          ) : null}
        </section>

        {paymentModalOpen && selectedDebt ? (
          <div className="staff-modal-backdrop">
            <div className="staff-modal">
              <div className="staff-modal-header">
                <div>
                  <div className="staff-modal-icon">
                    <WalletCards size={22} />
                  </div>

                  <h2>Record debt payment</h2>
                  <p>
                    {selectedDebt.customerName} owes{" "}
                    {formatRwf(selectedDebt.balanceRwf)}.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closePaymentModal}
                  className="staff-modal-close"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleRecordPayment} className="staff-modal-body">
                {selectedInstallment ? (
                  <div className={styles.selectedInstallmentBox}>
                    <div className="staff-form-section-title">
                      Selected installment
                    </div>

                    <strong>
                      Installment #{selectedInstallment.installmentNumber}
                    </strong>

                    <span>
                      Balance: {formatRwf(selectedInstallment.balanceRwf)} ·
                      Due: {formatDate(selectedInstallment.dueAt)}
                    </span>
                  </div>
                ) : (selectedDebt.installments || []).length > 0 ? (
                  <div className={styles.allocationBox}>
                    <div className="staff-form-section-title">
                      Payment allocation
                    </div>
                    <p>
                      No specific installment selected. The system will apply
                      this payment to the oldest unpaid installments first.
                    </p>
                  </div>
                ) : null}

                <div className="staff-form-grid">
                  <label className="staff-form-group">
                    <span>Amount received</span>
                    <input
                      type="number"
                      min={1}
                      max={
                        selectedInstallment
                          ? selectedInstallment.balanceRwf
                          : selectedDebt.balanceRwf
                      }
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
                        setMethod(event.target.value as SalePaymentMethod)
                      }
                    >
                      <option value="cash">Cash</option>
                      <option value="momo">MoMo</option>
                      <option value="bank">Bank</option>
                      <option value="card">Card</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </div>

                <label className="staff-form-group">
                  <span>Payment note</span>
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Example: Customer came back and paid installment."
                  />
                </label>

                <div className="staff-modal-footer">
                  <button
                    type="button"
                    onClick={closePaymentModal}
                    className="staff-btn staff-btn-outline"
                  >
                    Cancel
                  </button>

                  <AsyncButton
                    loading={saving}
                    disabled={!isCashOpen}
                    type="submit"
                  >
                    <Plus size={15} />
                    Save payment
                  </AsyncButton>
                </div>
              </form>
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

type MiniInfoProps = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
};

function MiniInfo({ label, value, tone = "default" }: MiniInfoProps) {
  return (
    <div
      className={cx(
        styles.miniInfo,
        tone === "success" && styles.miniInfoSuccess,
        tone === "warning" && styles.miniInfoWarning,
      )}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type EmptyCardProps = {
  icon: ReactNode;
  title: string;
  text: string;
};

function EmptyCard({ icon, title, text }: EmptyCardProps) {
  return (
    <div className={styles.emptyCard}>
      <div>{icon}</div>
      <strong>{title}</strong>
      <span>{text}</span>
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
