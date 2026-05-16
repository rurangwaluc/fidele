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
import styles from "./page.module.css";

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

function cleanLabel(value: string | null | undefined) {
  if (!value) return "Not set";
  return value.replaceAll("_", " ");
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

  const paymentTotal = useMemo(
    () =>
      payments.reduce(
        (sum, payment) => sum + Number(payment.amountRwf || 0),
        0,
      ),
    [payments],
  );

  const debt = debts[0] || null;
  const fullyPaid = Number(sale?.balanceRwf || 0) <= 0;
  const hasInstallments = installments.length > 0;

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
      <div className={styles.page}>
        <section className={`dashboard-hero ${styles.hero}`}>
          <div className={styles.heroCopy}>
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

          <div className={`dashboard-hero-actions ${styles.heroActions}`}>
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

        {message ? <div className={styles.messageBox}>{message}</div> : null}

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
            <section className={styles.proofPanel}>
              <div className={styles.proofMain}>
                <div className={styles.proofIcon}>
                  {fullyPaid ? (
                    <CheckCircle2 size={24} />
                  ) : (
                    <WalletCards size={24} />
                  )}
                </div>

                <div>
                  <span>Sale proof</span>
                  <strong>
                    {fullyPaid
                      ? "This sale is fully paid"
                      : "This customer still has a balance"}
                  </strong>
                  <p>
                    {sale.customerName || sale.walkInName || "Walk-in customer"}{" "}
                    · Created {formatDate(sale.createdAt)}
                  </p>
                </div>
              </div>

              <span
                className={
                  fullyPaid ? "badge badge-green" : "badge badge-orange"
                }
              >
                {fullyPaid ? "Fully paid" : "Balance left"}
              </span>
            </section>

            <div className={styles.metricsGrid}>
              <MetricCard
                icon={<ShoppingCart size={20} />}
                label="Sale total"
                value={formatRwf(sale.totalAmountRwf)}
                help="Total value of products sold"
                badge="Total"
                badgeClass="badge badge-blue"
              />

              <MetricCard
                icon={<CheckCircle2 size={20} />}
                label="Amount paid"
                value={formatRwf(sale.amountPaidRwf)}
                help="Money received for this sale"
                badge="Paid"
                badgeClass="badge badge-green"
              />

              <MetricCard
                icon={<WalletCards size={20} />}
                label="Remaining balance"
                value={formatRwf(sale.balanceRwf)}
                help={fullyPaid ? "Fully paid" : "Customer still owes money"}
                badge="Balance"
                badgeClass={
                  fullyPaid ? "badge badge-green" : "badge badge-orange"
                }
              />

              <MetricCard
                icon={<Package size={20} />}
                label="Quantity sold"
                value={String(totalQuantity)}
                help="Total units removed from stock"
                badge="Items"
                badgeClass="badge badge-blue"
              />
            </div>

            <div className={styles.mainGrid}>
              <section className="table-card premium-panel">
                <div className="table-card-header">
                  <div>
                    <div className="table-title">Customer and payment</div>
                    <div className="app-subtitle">
                      Who bought, who sold, and payment state.
                    </div>
                  </div>
                </div>

                <div className={styles.infoList}>
                  <InfoCard icon={<User size={17} />}>
                    <strong>
                      {sale.customerName ||
                        sale.walkInName ||
                        "Walk-in customer"}
                    </strong>
                    <span>{sale.customerPhone || "No phone recorded"}</span>
                    <span>Customer type: {cleanLabel(sale.customerType)}</span>
                  </InfoCard>

                  <InfoCard icon={<ShoppingCart size={17} />}>
                    <strong>Sold by {sale.soldByName || "Unknown user"}</strong>
                    <span>Created at {formatDate(sale.createdAt)}</span>
                    <span>Status: {cleanLabel(sale.status)}</span>
                  </InfoCard>

                  <InfoCard icon={<Clock size={17} />}>
                    <strong>Expected payment</strong>
                    <span>{formatDate(sale.expectedPaymentAt)}</span>
                    <span>
                      Payment status: {cleanLabel(sale.paymentStatus)}
                    </span>
                  </InfoCard>

                  {sale.notes ? (
                    <InfoCard icon={<ReceiptText size={17} />}>
                      <strong>Sale notes</strong>
                      <span>{sale.notes}</span>
                    </InfoCard>
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

                  {hasInstallments ? (
                    <span className="badge badge-orange">Installment plan</span>
                  ) : null}
                </div>

                <div className={styles.infoList}>
                  {debt ? (
                    <InfoCard icon={<WalletCards size={17} />}>
                      <strong>
                        {debt.balanceRwf > 0 ? "Open debt" : "Debt cleared"}
                      </strong>
                      <span>Original: {formatRwf(debt.originalAmountRwf)}</span>
                      <span>Paid: {formatRwf(debt.amountPaidRwf)}</span>
                      <span>Balance: {formatRwf(debt.balanceRwf)}</span>
                      <span>
                        Expected: {formatDate(debt.expectedPaymentAt)}
                      </span>
                    </InfoCard>
                  ) : (
                    <InfoCard icon={<CheckCircle2 size={17} />}>
                      <strong>No debt created</strong>
                      <span>This sale was fully paid at creation time.</span>
                    </InfoCard>
                  )}
                </div>
              </section>
            </div>

            {hasInstallments ? (
              <section className={`table-card premium-panel ${styles.section}`}>
                <div className="table-card-header">
                  <div>
                    <div className="table-title">Installment schedule</div>
                    <div className="app-subtitle">
                      Expected payments for this customer debt.
                    </div>
                  </div>
                </div>

                <div className={styles.installmentGrid}>
                  {installments.map((installment) => (
                    <div
                      key={installment.id}
                      className={styles.installmentCard}
                    >
                      <div className={styles.cardTop}>
                        <strong>
                          Installment {installment.installmentNumber}
                        </strong>

                        <span
                          className={
                            installment.balanceRwf <= 0
                              ? "badge badge-green"
                              : "badge badge-orange"
                          }
                        >
                          {installment.balanceRwf <= 0
                            ? "paid"
                            : cleanLabel(installment.status)}
                        </span>
                      </div>

                      <div className={styles.miniGrid}>
                        <MiniInfo
                          label="Expected"
                          value={formatRwf(installment.expectedAmountRwf)}
                        />
                        <MiniInfo
                          label="Paid"
                          value={formatRwf(installment.amountPaidRwf)}
                        />
                        <MiniInfo
                          label="Balance"
                          value={formatRwf(installment.balanceRwf)}
                        />
                        <MiniInfo
                          label="Due date"
                          value={formatDate(installment.dueAt)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className={`table-card premium-panel ${styles.section}`}>
              <div className="table-card-header">
                <div>
                  <div className="table-title">Products sold</div>
                  <div className="app-subtitle">
                    These items were removed from stock when the sale was saved.
                  </div>
                </div>
              </div>

              <div className={styles.productGrid}>
                {items.map((item) => (
                  <div key={item.id} className={styles.productCard}>
                    <div className={styles.cardTop}>
                      <div>
                        <strong>{item.productNameSnapshot}</strong>
                        <span>{item.skuSnapshot || "No SKU"}</span>
                      </div>

                      <span
                        className={
                          item.soldBelowMinimum
                            ? "badge badge-orange"
                            : "badge badge-blue"
                        }
                      >
                        Min {formatRwf(item.minSellingPriceRwf)}
                      </span>
                    </div>

                    <div className={styles.miniGrid}>
                      <MiniInfo
                        label="Quantity"
                        value={String(item.quantity)}
                      />
                      <MiniInfo
                        label="Unit price"
                        value={formatRwf(item.unitPriceRwf)}
                      />
                      <MiniInfo
                        label="Line total"
                        value={formatRwf(item.lineTotalRwf)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={`table-card premium-panel ${styles.section}`}>
              <div className="table-card-header">
                <div>
                  <div className="table-title">Payments received</div>
                  <div className="app-subtitle">
                    Payments recorded during sale creation or later debt
                    payment.
                  </div>
                </div>

                <span className="badge badge-green">
                  {formatRwf(paymentTotal)}
                </span>
              </div>

              <div className={styles.paymentGrid}>
                {payments.map((payment) => (
                  <div key={payment.id} className={styles.paymentCard}>
                    <div className={styles.cardTop}>
                      <strong>{formatRwf(payment.amountRwf)}</strong>
                      <span className="badge badge-blue">{payment.method}</span>
                    </div>

                    <span>{payment.note || "No note"}</span>
                    <small>{formatDate(payment.paidAt)}</small>
                  </div>
                ))}

                {payments.length === 0 ? (
                  <div className={styles.emptyCard}>
                    <ReceiptText size={18} />
                    <strong>No payment received yet</strong>
                    <span>
                      Payments will appear here when the customer pays.
                    </span>
                  </div>
                ) : null}
              </div>
            </section>

            {hasInstallments ? (
              <div className={styles.footerAction}>
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
      </div>
    </AppShell>
  );
}

type MetricCardProps = {
  icon: React.ReactNode;
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

type InfoCardProps = {
  icon: React.ReactNode;
  children: React.ReactNode;
};

function InfoCard({ icon, children }: InfoCardProps) {
  return (
    <div className={styles.infoCard}>
      <div className={styles.infoIcon}>{icon}</div>
      <div className={styles.infoBody}>{children}</div>
    </div>
  );
}

type MiniInfoProps = {
  label: string;
  value: string;
};

function MiniInfo({ label, value }: MiniInfoProps) {
  return (
    <div className={styles.miniInfo}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
