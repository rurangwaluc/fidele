"use client";

import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  User,
  WalletCards,
} from "lucide-react";
import {
  CustomerDebtInstallment,
  SaleDebt,
  SaleDetail,
  SaleDetailItem,
  SalePayment,
  getSale,
} from "@/lib/sales";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { AppShell } from "@/components/app/AppShell";
import { getToken } from "@/lib/auth";

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

export default function SaleDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const rawSaleId = params?.id;
  const saleId = Array.isArray(rawSaleId) ? rawSaleId[0] : rawSaleId;

  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [items, setItems] = useState<SaleDetailItem[]>([]);
  const [payments, setPayments] = useState<SalePayment[]>([]);
  const [debts, setDebts] = useState<SaleDebt[]>([]);
  const [installments, setInstallments] = useState<CustomerDebtInstallment[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [items],
  );

  const debt = debts[0] || null;

  useEffect(() => {
    if (!saleId) return;
    loadSale(saleId);
  }, [saleId]);

  async function loadSale(id: string) {
    const token = getToken();

    if (!token) {
      setMessage("You are not logged in.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await getSale(token, id);

      setSale(response.sale);
      setItems(response.items);
      setPayments(response.payments);
      setDebts(response.debts);
      setInstallments(response.installments || []);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load sale.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Sale Details">
      <section className="dashboard-hero">
        <div>
          <span className="hero-kicker dashboard-kicker">
            <ReceiptText size={15} />
            Sale record
          </span>

          <h1>{sale?.saleNumber || "Sale details"}</h1>

          <p>
            Full proof of the sale: customer, products sold, amount paid,
            remaining balance, debt, and installment schedule.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => router.push("/sales")}
          >
            <ArrowLeft size={14} />
            Back to sales
          </button>

          <button
            className="btn btn-outline"
            type="button"
            onClick={() => {
              if (saleId) loadSale(saleId);
            }}
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

      {loading ? (
        <div className="loading-card">
          <Loader2 className="spin" size={18} />
          <div>
            <strong>Loading sale...</strong>
            <p>Checking sale details.</p>
          </div>
        </div>
      ) : null}

      {!loading && sale ? (
        <>
          <div className="premium-stats-grid">
            <div className="premium-stat-card">
              <div className="stat-card-top">
                <div className="feature-icon">
                  <ShoppingCart size={20} />
                </div>
                <span className="badge badge-blue">Total</span>
              </div>
              <div className="stat-label">Sale total</div>
              <div className="stat-value" style={{ fontSize: 24 }}>
                {formatRwf(sale.totalAmountRwf)}
              </div>
              <div className="stat-help">Total value of products sold</div>
            </div>

            <div className="premium-stat-card">
              <div className="stat-card-top">
                <div className="feature-icon">
                  <CheckCircle2 size={20} />
                </div>
                <span className="badge badge-green">Paid</span>
              </div>
              <div className="stat-label">Amount paid</div>
              <div className="stat-value" style={{ fontSize: 24 }}>
                {formatRwf(sale.amountPaidRwf)}
              </div>
              <div className="stat-help">Money received for this sale</div>
            </div>

            <div className="premium-stat-card">
              <div className="stat-card-top">
                <div className="feature-icon">
                  <WalletCards size={20} />
                </div>
                <span
                  className={
                    sale.balanceRwf > 0
                      ? "badge badge-orange"
                      : "badge badge-green"
                  }
                >
                  Balance
                </span>
              </div>
              <div className="stat-label">Remaining balance</div>
              <div className="stat-value" style={{ fontSize: 24 }}>
                {formatRwf(sale.balanceRwf)}
              </div>
              <div className="stat-help">
                {sale.balanceRwf > 0
                  ? "Customer still owes money"
                  : "Fully paid"}
              </div>
            </div>

            <div className="premium-stat-card">
              <div className="stat-card-top">
                <div className="feature-icon">
                  <Package size={20} />
                </div>
                <span className="badge badge-blue">Items</span>
              </div>
              <div className="stat-label">Quantity sold</div>
              <div className="stat-value">{totalQuantity}</div>
              <div className="stat-help">Total units removed from stock</div>
            </div>
          </div>

          <div className="dashboard-grid">
            <section className="table-card premium-panel">
              <div className="table-card-header">
                <div>
                  <div className="table-title">Customer and payment</div>
                  <div className="app-subtitle">
                    Who bought, who sold, and payment state.
                  </div>
                </div>
              </div>

              <div className="attention-list">
                <div className="attention-item">
                  <User size={17} />
                  <div>
                    <strong>
                      {sale.customerName ||
                        sale.walkInName ||
                        "Walk-in customer"}
                    </strong>
                    <span>{sale.customerPhone || "No phone recorded"}</span>
                    <span>Customer type: {sale.customerType}</span>
                  </div>
                </div>

                <div className="attention-item">
                  <ShoppingCart size={17} />
                  <div>
                    <strong>Sold by {sale.soldByName || "Unknown user"}</strong>
                    <span>Created at {formatDate(sale.createdAt)}</span>
                    <span>Status: {sale.status}</span>
                  </div>
                </div>

                <div className="attention-item">
                  <Clock size={17} />
                  <div>
                    <strong>Expected payment</strong>
                    <span>{formatDate(sale.expectedPaymentAt)}</span>
                    <span>Payment status: {sale.paymentStatus}</span>
                  </div>
                </div>

                {sale.notes ? (
                  <div className="attention-item">
                    <ReceiptText size={17} />
                    <div>
                      <strong>Sale notes</strong>
                      <span>{sale.notes}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="table-card premium-panel">
              <div className="table-card-header">
                <div>
                  <div className="table-title">Debt record</div>
                  <div className="app-subtitle">
                    Appears when customer did not fully pay.
                  </div>
                </div>

                {installments.length > 0 ? (
                  <span className="badge badge-orange">Installment plan</span>
                ) : null}
              </div>

              <div className="attention-list">
                {debt ? (
                  <div className="attention-item">
                    <WalletCards size={17} />
                    <div>
                      <strong>
                        {debt.balanceRwf > 0 ? "Open debt" : "Debt cleared"}
                      </strong>
                      <span>Original: {formatRwf(debt.originalAmountRwf)}</span>
                      <span>Paid: {formatRwf(debt.amountPaidRwf)}</span>
                      <span>Balance: {formatRwf(debt.balanceRwf)}</span>
                      <span>
                        Expected: {formatDate(debt.expectedPaymentAt)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="attention-item">
                    <CheckCircle2 size={17} />
                    <div>
                      <strong>No debt created</strong>
                      <span>This sale was fully paid at creation time.</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {installments.length > 0 ? (
            <section
              className="table-card premium-panel"
              style={{ marginTop: 18 }}
            >
              <div className="table-card-header">
                <div>
                  <div className="table-title">Installment schedule</div>
                  <div className="app-subtitle">
                    Expected payments for this customer debt.
                  </div>
                </div>
              </div>

              <div className="tbl-overflow">
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Expected amount</th>
                      <th>Paid</th>
                      <th>Balance</th>
                      <th>Due date</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {installments.map((installment) => (
                      <tr key={installment.id}>
                        <td>{installment.installmentNumber}</td>
                        <td>{formatRwf(installment.expectedAmountRwf)}</td>
                        <td>{formatRwf(installment.amountPaidRwf)}</td>
                        <td>{formatRwf(installment.balanceRwf)}</td>
                        <td>{formatDate(installment.dueAt)}</td>
                        <td>
                          <span
                            className={
                              installment.balanceRwf <= 0
                                ? "badge badge-green"
                                : "badge badge-orange"
                            }
                          >
                            {installment.balanceRwf <= 0
                              ? "paid"
                              : installment.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section
            className="table-card premium-panel"
            style={{ marginTop: 18 }}
          >
            <div className="table-card-header">
              <div>
                <div className="table-title">Products sold</div>
                <div className="app-subtitle">
                  These items were removed from stock when the sale was saved.
                </div>
              </div>
            </div>

            <div className="tbl-overflow">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Quantity</th>
                    <th>Unit price</th>
                    <th>Total</th>
                    <th>Minimum price</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div
                          style={{ fontWeight: 900, color: "var(--gray-900)" }}
                        >
                          {item.productNameSnapshot}
                        </div>
                      </td>
                      <td>{item.skuSnapshot}</td>
                      <td>{item.quantity}</td>
                      <td>{formatRwf(item.unitPriceRwf)}</td>
                      <td>{formatRwf(item.lineTotalRwf)}</td>
                      <td>
                        <span
                          className={
                            item.soldBelowMinimum
                              ? "badge badge-orange"
                              : "badge badge-blue"
                          }
                        >
                          {formatRwf(item.minSellingPriceRwf)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            className="table-card premium-panel"
            style={{ marginTop: 18 }}
          >
            <div className="table-card-header">
              <div>
                <div className="table-title">Payments received</div>
                <div className="app-subtitle">
                  Payments recorded during sale creation or later debt payment.
                </div>
              </div>
            </div>

            <div className="tbl-overflow">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Note</th>
                    <th>Paid at</th>
                  </tr>
                </thead>

                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatRwf(payment.amountRwf)}</td>
                      <td>{payment.method}</td>
                      <td>{payment.note || "No note"}</td>
                      <td>{formatDate(payment.paidAt)}</td>
                    </tr>
                  ))}

                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <div
                          style={{
                            padding: 24,
                            textAlign: "center",
                            color: "var(--gray-500)",
                            fontWeight: 800,
                          }}
                        >
                          No payment received yet.
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {installments.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => router.push("/debts")}
              >
                <CalendarClock size={14} />
                Manage installment payments
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
