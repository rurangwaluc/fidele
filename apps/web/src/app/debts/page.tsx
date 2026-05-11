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
import { FormEvent, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import { SalePaymentMethod } from "@/lib/sales";
import { getToken } from "@/lib/auth";
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

export default function DebtsPage() {
  const router = useRouter();

  const [debts, setDebts] = useState<CustomerDebt[]>([]);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

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
      <section className="dashboard-hero">
        <div>
          <span className="hero-kicker dashboard-kicker">
            <WalletCards size={15} />
            Customer debts
          </span>

          <h1>Pay-later and installments</h1>

          <p>
            Track customers who took products and promised to pay later. Record
            full, partial, or installment payments here.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <button className="btn btn-outline" type="button" onClick={loadData}>
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
                Payment receiving is blocked
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
              <WalletCards size={20} />
            </div>
            <span className="badge badge-orange">Balance</span>
          </div>
          <div className="stat-label">Open balance</div>
          <div className="stat-value" style={{ fontSize: 24 }}>
            {formatRwf(totalDebtBalance)}
          </div>
          <div className="stat-help">Money customers still owe</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <Clock size={20} />
            </div>
            <span className="badge badge-orange">Pending</span>
          </div>
          <div className="stat-label">Pending debts</div>
          <div className="stat-value">{pendingDebts.length}</div>
          <div className="stat-help">Customers who still need to pay</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <CalendarClock size={20} />
            </div>
            <span className="badge badge-blue">Plans</span>
          </div>
          <div className="stat-label">Installment plans</div>
          <div className="stat-value">{installmentDebts.length}</div>
          <div className="stat-help">
            {overdueInstallments.length} overdue installment(s)
          </div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <CreditCard size={20} />
            </div>
            <span className="badge badge-blue">Total</span>
          </div>
          <div className="stat-label">Original debt amount</div>
          <div className="stat-value" style={{ fontSize: 24 }}>
            {formatRwf(totalDebtOriginal)}
          </div>
          <div className="stat-help">
            {paidDebts.length} debt record(s) fully cleared
          </div>
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
            <div className="table-title">Customer debt list</div>
            <div className="app-subtitle">
              Record full debt payments or pay specific installments.
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

        <div className="tbl-overflow">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Sale</th>
                <th>Debt</th>
                <th>Plan</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {debts.map((debt) => {
                const installments = debt.installments || [];
                const nextInstallment =
                  installments.find(
                    (installment) => installment.balanceRwf > 0,
                  ) || null;

                return (
                  <tr key={debt.id}>
                    <td>
                      <div
                        style={{ fontWeight: 900, color: "var(--gray-900)" }}
                      >
                        {debt.customerName}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: "var(--gray-500)",
                          fontWeight: 700,
                        }}
                      >
                        {debt.customerPhone || "No phone"}
                      </div>
                    </td>

                    <td>
                      <span className="badge badge-blue">
                        {debt.saleNumber || "No sale"}
                      </span>
                    </td>

                    <td>
                      <div
                        style={{ fontWeight: 900, color: "var(--gray-900)" }}
                      >
                        Balance: {formatRwf(debt.balanceRwf)}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          color: "var(--gray-400)",
                          fontWeight: 800,
                        }}
                      >
                        Original: {formatRwf(debt.originalAmountRwf)} · Paid:{" "}
                        {formatRwf(debt.amountPaidRwf)}
                      </div>
                    </td>

                    <td>
                      {installments.length > 0 ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span className="badge badge-orange">
                            {installments.length} installments
                          </span>

                          {nextInstallment ? (
                            <span
                              style={{
                                color: "var(--gray-500)",
                                fontSize: 11,
                                fontWeight: 800,
                              }}
                            >
                              Next: #{nextInstallment.installmentNumber} ·{" "}
                              {formatRwf(nextInstallment.balanceRwf)} ·{" "}
                              {formatDate(nextInstallment.dueAt)}
                            </span>
                          ) : (
                            <span
                              style={{
                                color: "var(--gray-500)",
                                fontSize: 11,
                                fontWeight: 800,
                              }}
                            >
                              All installments cleared
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="badge badge-blue">One payment</span>
                      )}
                    </td>

                    <td>
                      <span
                        className={
                          debt.balanceRwf > 0
                            ? "badge badge-orange"
                            : "badge badge-green"
                        }
                      >
                        {debt.balanceRwf > 0 ? debt.status : "paid"}
                      </span>
                    </td>

                    <td style={{ textAlign: "right" }}>
                      {debt.balanceRwf > 0 ? (
                        <button
                          className="btn btn-primary btn-sm"
                          type="button"
                          onClick={() => openPaymentModal(debt)}
                          disabled={!isCashOpen}
                          style={{
                            opacity: isCashOpen ? 1 : 0.5,
                            cursor: isCashOpen ? "pointer" : "not-allowed",
                          }}
                        >
                          <Plus size={13} />
                          Record payment
                        </button>
                      ) : (
                        <span
                          style={{ color: "var(--gray-400)", fontWeight: 900 }}
                        >
                          Cleared
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {debts.length === 0 ? (
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
                      No customer debts yet.
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-card premium-panel" style={{ marginTop: 18 }}>
        <div className="table-card-header">
          <div>
            <div className="table-title">Installment schedules</div>
            <div className="app-subtitle">
              Quick view of all installment plans and their payment status.
            </div>
          </div>
        </div>

        <div className="attention-list">
          {installmentDebts.map((debt) => (
            <div key={debt.id} className="attention-item">
              <CalendarClock size={17} />
              <div style={{ width: "100%" }}>
                <strong>
                  {debt.customerName} · {debt.saleNumber || "No sale number"}
                </strong>
                <span>
                  Balance: {formatRwf(debt.balanceRwf)} · Original:{" "}
                  {formatRwf(debt.originalAmountRwf)}
                </span>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {(debt.installments || []).map((installment) => (
                    <div
                      key={installment.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "70px 1fr 1fr 1fr auto",
                        gap: 10,
                        alignItems: "center",
                        padding: 10,
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        background: "var(--card)",
                      }}
                    >
                      <span
                        style={{ fontWeight: 900, color: "var(--gray-900)" }}
                      >
                        #{installment.installmentNumber}
                      </span>

                      <span
                        style={{ fontWeight: 800, color: "var(--gray-700)" }}
                      >
                        {formatRwf(installment.expectedAmountRwf)}
                      </span>

                      <span
                        style={{ fontWeight: 800, color: "var(--gray-500)" }}
                      >
                        Balance: {formatRwf(installment.balanceRwf)}
                      </span>

                      <span
                        style={{ fontWeight: 800, color: "var(--gray-500)" }}
                      >
                        Due: {formatDate(installment.dueAt)}
                      </span>

                      {installment.balanceRwf > 0 ? (
                        <button
                          className="btn btn-outline btn-sm"
                          type="button"
                          onClick={() => openPaymentModal(debt, installment)}
                          disabled={!isCashOpen}
                          style={{
                            opacity: isCashOpen ? 1 : 0.5,
                            cursor: isCashOpen ? "pointer" : "not-allowed",
                          }}
                        >
                          Pay
                        </button>
                      ) : (
                        <span className="badge badge-green">Paid</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {installmentDebts.length === 0 ? (
            <div className="attention-item">
              <CheckCircle2 size={17} />
              <div>
                <strong>No installment plans yet</strong>
                <span>Create an installment sale from the Sell page.</span>
              </div>
            </div>
          ) : null}
        </div>
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
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    padding: 14,
                    background: "var(--gold-lt)",
                    color: "var(--gray-900)",
                  }}
                >
                  <div className="staff-form-section-title">
                    Selected installment
                  </div>

                  <div style={{ marginTop: 8, fontWeight: 900 }}>
                    Installment #{selectedInstallment.installmentNumber}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      color: "var(--gray-600)",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    Balance: {formatRwf(selectedInstallment.balanceRwf)} · Due:{" "}
                    {formatDate(selectedInstallment.dueAt)}
                  </div>
                </div>
              ) : (selectedDebt.installments || []).length > 0 ? (
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    padding: 14,
                    background: "var(--gray-50)",
                    color: "var(--gray-900)",
                  }}
                >
                  <div className="staff-form-section-title">
                    Payment allocation
                  </div>
                  <p
                    style={{
                      marginTop: 8,
                      color: "var(--gray-500)",
                      fontWeight: 750,
                      lineHeight: 1.5,
                    }}
                  >
                    No specific installment selected. The system will apply this
                    payment to the oldest unpaid installments first.
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
    </AppShell>
  );
}
