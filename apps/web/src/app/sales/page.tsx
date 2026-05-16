"use client";

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  User,
  WalletCards,
} from "lucide-react";
import { CashSession, getCashToday } from "@/lib/cash";
import { Customer, getCustomers } from "@/lib/customers";
import type { FormEvent, ReactNode } from "react";
import {
  InstallmentFrequency,
  SaleCustomerType,
  SaleListItem,
  SalePaymentMethod,
  createSale,
  getSales,
} from "@/lib/sales";
import { Product, getProducts } from "@/lib/products";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import { getToken } from "@/lib/auth";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";

type SaleItemForm = {
  rowId: string;
  productId: string;
  quantity: string;
  unitPriceRwf: string;
};

type PaymentMode = "paid_now" | "partial" | "pay_later" | "installment";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function makeRow(): SaleItemForm {
  return {
    rowId: Math.random().toString(36).slice(2),
    productId: "",
    quantity: "1",
    unitPriceRwf: "0",
  };
}

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

function makeEveningLocalValue() {
  const date = new Date();

  if (date.getHours() >= 20) {
    date.setDate(date.getDate() + 1);
  }

  date.setHours(20, 0, 0, 0);

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);

  return localDate.toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string) {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

function addFrequency(
  startDate: Date,
  frequency: InstallmentFrequency,
  step: number,
) {
  const date = new Date(startDate);

  if (frequency === "daily") {
    date.setDate(date.getDate() + step);
  }

  if (frequency === "weekly") {
    date.setDate(date.getDate() + step * 7);
  }

  if (frequency === "monthly") {
    date.setMonth(date.getMonth() + step);
  }

  return date;
}

export default function SalesPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [customerType, setCustomerType] = useState<SaleCustomerType>("walk_in");
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [walkInName, setWalkInName] = useState("Walk-in customer");

  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerNotes, setNewCustomerNotes] = useState("");

  const [items, setItems] = useState<SaleItemForm[]>([makeRow()]);

  const [paymentMode, setPaymentMode] = useState<PaymentMode>("paid_now");
  const [amountPaidRwf, setAmountPaidRwf] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>("cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [expectedPaymentAt, setExpectedPaymentAt] = useState("");
  const [saleNotes, setSaleNotes] = useState("");

  const [numberOfInstallments, setNumberOfInstallments] = useState("3");
  const [installmentFrequency, setInstallmentFrequency] =
    useState<InstallmentFrequency>("weekly");
  const [firstInstallmentDueAt, setFirstInstallmentDueAt] = useState("");

  const [recentSalesSearch, setRecentSalesSearch] = useState("");
  const [visibleSalesCount, setVisibleSalesCount] = useState(8);

  const isCashOpen = cashSession?.status === "open";

  const cashMessage = !cashSession
    ? "Cash session is not open. Open cash before creating sales."
    : cashSession.status === "closed"
      ? "Cash session is closed. Sales are blocked for this business date."
      : "";

  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive),
    [products],
  );

  const activeCustomers = useMemo(
    () => customers.filter((customer) => customer.isActive),
    [customers],
  );

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();

    if (!term) {
      return activeCustomers.slice(0, 8);
    }

    return activeCustomers
      .filter((customer) => {
        const name = customer.name.toLowerCase();
        const phone = (customer.phone || "").toLowerCase();
        const address = (customer.address || "").toLowerCase();

        return (
          name.includes(term) || phone.includes(term) || address.includes(term)
        );
      })
      .slice(0, 8);
  }, [activeCustomers, customerSearch]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) || null,
    [customers, customerId],
  );

  const totalAmountRwf = useMemo(() => {
    return items.reduce((sum, item) => {
      return sum + Number(item.quantity || 0) * Number(item.unitPriceRwf || 0);
    }, 0);
  }, [items]);

  const finalAmountPaidRwf = useMemo(() => {
    if (paymentMode === "paid_now") return totalAmountRwf;
    if (paymentMode === "pay_later") return 0;
    return Number(amountPaidRwf || 0);
  }, [amountPaidRwf, paymentMode, totalAmountRwf]);

  const balanceRwf = Math.max(0, totalAmountRwf - finalAmountPaidRwf);

  const paidSales = sales.filter((sale) => sale.balanceRwf <= 0);
  const unpaidSales = sales.filter((sale) => sale.balanceRwf > 0);

  const filteredRecentSales = useMemo(() => {
    const term = recentSalesSearch.trim().toLowerCase();

    if (!term) return sales;

    return sales.filter((sale) => {
      const saleNumber = sale.saleNumber.toLowerCase();
      const customerName = (sale.customerName || "").toLowerCase();
      const walkInNameValue = (sale.walkInName || "").toLowerCase();
      const soldByName = (sale.soldByName || "").toLowerCase();

      return (
        saleNumber.includes(term) ||
        customerName.includes(term) ||
        walkInNameValue.includes(term) ||
        soldByName.includes(term)
      );
    });
  }, [recentSalesSearch, sales]);

  const visibleRecentSales = useMemo(
    () => filteredRecentSales.slice(0, visibleSalesCount),
    [filteredRecentSales, visibleSalesCount],
  );

  const hasMoreRecentSales = visibleSalesCount < filteredRecentSales.length;

  const installmentPreview = useMemo(() => {
    if (paymentMode !== "installment") return [];

    const count = Math.max(1, Number(numberOfInstallments || 1));
    const baseAmount = Math.floor(balanceRwf / count);
    const remainder = balanceRwf % count;
    const firstDueDate = firstInstallmentDueAt
      ? new Date(firstInstallmentDueAt)
      : new Date();

    return Array.from({ length: count }).map((_, index) => {
      const isLast = index === count - 1;
      const amount = isLast ? baseAmount + remainder : baseAmount;
      const dueDate = addFrequency(firstDueDate, installmentFrequency, index);

      return {
        number: index + 1,
        amount,
        dueDate,
      };
    });
  }, [
    balanceRwf,
    firstInstallmentDueAt,
    installmentFrequency,
    numberOfInstallments,
    paymentMode,
  ]);

  useEffect(() => {
    const evening = makeEveningLocalValue();
    setExpectedPaymentAt(evening);
    setFirstInstallmentDueAt(evening);
    loadData();
  }, []);

  async function loadData() {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setMessage("");

    try {
      const [productsResponse, customersResponse, salesResponse, cashResponse] =
        await Promise.all([
          getProducts(token),
          getCustomers(token),
          getSales(token),
          getCashToday(token),
        ]);

      setProducts(productsResponse.products);
      setCustomers(customersResponse.customers);
      setSales(salesResponse.sales);
      setCashSession(cashResponse.session);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load sales.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetSaleForm() {
    const evening = makeEveningLocalValue();

    setCustomerType("walk_in");
    setCustomerId("");
    setCustomerSearch("");
    setWalkInName("Walk-in customer");

    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerAddress("");
    setNewCustomerNotes("");

    setItems([makeRow()]);

    setPaymentMode("paid_now");
    setAmountPaidRwf("0");
    setPaymentMethod("cash");
    setPaymentNote("");
    setExpectedPaymentAt(evening);
    setSaleNotes("");

    setNumberOfInstallments("3");
    setInstallmentFrequency("weekly");
    setFirstInstallmentDueAt(evening);
  }

  function chooseCustomerType(type: SaleCustomerType) {
    setCustomerType(type);
    setCustomerId("");
    setCustomerSearch("");

    if (type === "walk_in") {
      setPaymentMode("paid_now");
      setAmountPaidRwf(String(totalAmountRwf));
      setPaymentNote("");
      setMessage("");
    }
  }

  function chooseExistingCustomer(customer: Customer) {
    setCustomerId(customer.id);
    setCustomerSearch(
      `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}`,
    );
  }

  function updateItem(rowId: string, key: keyof SaleItemForm, value: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.rowId !== rowId) return item;

        if (key === "productId") {
          const product = products.find(
            (productItem) => productItem.id === value,
          );

          return {
            ...item,
            productId: value,
            unitPriceRwf: product
              ? String(product.sellingPriceRwf)
              : item.unitPriceRwf,
          };
        }

        return {
          ...item,
          [key]: value,
        };
      }),
    );
  }

  function addItemRow() {
    setItems((current) => [...current, makeRow()]);
  }

  function removeItemRow(rowId: string) {
    setItems((current) =>
      current.length === 1
        ? current
        : current.filter((item) => item.rowId !== rowId),
    );
  }

  function switchPaymentMode(mode: PaymentMode) {
    if (customerType === "walk_in" && mode !== "paid_now") {
      setPaymentMode("paid_now");
      setAmountPaidRwf(String(totalAmountRwf));
      setMessage(
        "Walk-in customers cannot buy on credit. Choose an existing customer or create a new customer for deposit, pay later, or installments.",
      );
      return;
    }

    setMessage("");
    setPaymentMode(mode);

    if (mode === "paid_now") {
      setAmountPaidRwf(String(totalAmountRwf));
    }

    if (mode === "pay_later") {
      setAmountPaidRwf("0");
    }

    if (mode === "partial" || mode === "installment") {
      setAmountPaidRwf("0");
    }
  }

  async function handleCreateSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isCashOpen) {
      setMessage(cashMessage || "Open cash before creating sales.");
      return;
    }

    const token = getToken();
    if (!token) return;

    const cleanItems = items.map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity || 0),
      unitPriceRwf: Number(item.unitPriceRwf || 0),
    }));

    const hasInvalidItem = cleanItems.some(
      (item) => !item.productId || item.quantity < 1 || item.unitPriceRwf < 0,
    );

    if (hasInvalidItem) {
      setMessage(
        "Please choose product, quantity, and selling price correctly.",
      );
      return;
    }

    if (customerType === "walk_in" && paymentMode !== "paid_now") {
      setMessage(
        "Walk-in customers must pay the full amount now. For credit, choose existing customer or create new customer.",
      );
      return;
    }

    if (customerType === "walk_in" && balanceRwf > 0) {
      setMessage(
        "Walk-in customers cannot have a balance. They must pay the full amount now.",
      );
      return;
    }

    if (customerType === "existing" && !customerId) {
      setMessage("Search and choose an existing customer.");
      return;
    }

    if (customerType === "new" && !newCustomerName.trim()) {
      setMessage("Enter the new customer name.");
      return;
    }

    if (finalAmountPaidRwf > totalAmountRwf) {
      setMessage("Amount paid cannot be greater than sale total.");
      return;
    }

    if (paymentMode === "installment") {
      const count = Number(numberOfInstallments || 0);

      if (balanceRwf <= 0) {
        setMessage("Installment plan needs a remaining balance.");
        return;
      }

      if (!count || count < 1) {
        setMessage("Number of installments must be at least 1.");
        return;
      }

      if (!firstInstallmentDueAt) {
        setMessage("Choose the first installment due date.");
        return;
      }
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await createSale(token, {
        customerType,
        customerId: customerType === "existing" ? customerId : undefined,
        walkInName: customerType === "walk_in" ? walkInName : undefined,
        newCustomer:
          customerType === "new"
            ? {
                name: newCustomerName,
                phone: newCustomerPhone,
                address: newCustomerAddress,
                notes: newCustomerNotes,
              }
            : undefined,
        items: cleanItems,
        payment: {
          amountPaidRwf: finalAmountPaidRwf,
          method: paymentMethod,
          note: paymentNote,
          expectedPaymentAt:
            balanceRwf > 0 && paymentMode !== "installment"
              ? localDateTimeToIso(expectedPaymentAt)
              : undefined,
          installmentPlan:
            paymentMode === "installment"
              ? {
                  numberOfInstallments: Number(numberOfInstallments || 1),
                  frequency: installmentFrequency,
                  firstDueAt: localDateTimeToIso(firstInstallmentDueAt),
                }
              : undefined,
        },
        notes: saleNotes,
      });

      resetSaleForm();
      router.push(`/sales/${response.sale.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create sale.",
      );
    } finally {
      setSaving(false);
    }
  }

  const creditDisabledForWalkIn = customerType === "walk_in";

  return (
    <AppShell title="Sell">
      <div className={styles.salesPage}>
        <section className={`dashboard-hero ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className="hero-kicker dashboard-kicker">
              <ShoppingCart size={15} />
              Sales and pay later
            </span>

            <h1>Create sale</h1>

            <p>
              Walk-in customers must pay now. Deposit, pay later, and
              installments require a saved customer profile.
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
            title="Selling is blocked"
            text={cashMessage}
            actionLabel={cashSession ? "View cash" : "Open cash"}
            onAction={() => router.push("/cash")}
          />
        ) : null}

        <div className={styles.metricsGrid}>
          <MetricCard
            icon={<ShoppingCart size={20} />}
            label="Sales records"
            value={String(sales.length)}
            help="Latest sales in the system"
            badge="Sales"
            badgeClass="badge badge-blue"
          />

          <MetricCard
            icon={<CheckCircle2 size={20} />}
            label="Paid sales"
            value={String(paidSales.length)}
            help="Sales with no remaining balance"
            badge="Paid"
            badgeClass="badge badge-green"
          />

          <MetricCard
            icon={<WalletCards size={20} />}
            label="Credit sales"
            value={String(unpaidSales.length)}
            help="Saved customers with remaining balance"
            badge="Debt"
            badgeClass="badge badge-orange"
          />

          <MetricCard
            icon={<Package size={20} />}
            label="Available products"
            value={String(activeProducts.length)}
            help="Products ready for selling"
            badge="Stock"
            badgeClass="badge badge-blue"
          />
        </div>

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        <div className={styles.mainGrid}>
          <section className={`table-card premium-panel ${styles.formPanel}`}>
            <div className="table-card-header">
              <div>
                <div className="table-title">New sale</div>
                <div className="app-subtitle">
                  Product leaves stock immediately after the sale is saved.
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

            <form onSubmit={handleCreateSale} className={styles.formBody}>
              <section className={styles.formSection}>
                <div className="staff-form-section-title">Customer</div>

                <div className={styles.customerTypeGrid}>
                  <ChoiceCard
                    title="Walk-in"
                    text="Paid now only. No credit."
                    selected={customerType === "walk_in"}
                    onClick={() => chooseCustomerType("walk_in")}
                  />

                  <ChoiceCard
                    title="Existing"
                    text="Can pay now, later, or installments."
                    selected={customerType === "existing"}
                    onClick={() => chooseCustomerType("existing")}
                  />

                  <ChoiceCard
                    title="New customer"
                    text="Create customer for credit sale."
                    selected={customerType === "new"}
                    onClick={() => chooseCustomerType("new")}
                  />
                </div>
              </section>

              {customerType === "walk_in" ? (
                <section className={styles.formSection}>
                  <label className="staff-form-group">
                    <span>Walk-in name</span>
                    <input
                      value={walkInName}
                      onChange={(event) => setWalkInName(event.target.value)}
                    />
                  </label>

                  <div className={styles.goldInfo}>
                    Walk-in customers must pay the full amount immediately. To
                    allow deposit, pay later, or installments, choose Existing
                    customer or New customer.
                  </div>
                </section>
              ) : null}

              {customerType === "existing" ? (
                <section className={styles.formSection}>
                  <label className="staff-form-group">
                    <span>Search existing customer</span>
                    <div className="hdr-search">
                      <Search size={14} />
                      <input
                        value={customerSearch}
                        onChange={(event) => {
                          setCustomerSearch(event.target.value);
                          setCustomerId("");
                        }}
                        placeholder="Type customer name, phone, or address..."
                      />
                    </div>
                  </label>

                  {selectedCustomer ? (
                    <div className={styles.selectedCustomer}>
                      <User size={17} />
                      <div>
                        <strong>{selectedCustomer.name}</strong>
                        <span>
                          {selectedCustomer.phone || "No phone"} ·{" "}
                          {selectedCustomer.address || "No address"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.customerResults}>
                      {filteredCustomers.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => chooseExistingCustomer(customer)}
                          className={styles.customerResult}
                        >
                          <div>
                            <strong>{customer.name}</strong>
                            <span className={styles.customerResultMeta}>
                              {customer.phone || "No phone"} ·{" "}
                              {customer.address || "No address"}
                            </span>
                          </div>

                          <span className="badge badge-blue">Choose</span>
                        </button>
                      ))}

                      {filteredCustomers.length === 0 ? (
                        <div className={styles.emptyCustomer}>
                          No customer found. Use “New customer” to create one.
                        </div>
                      ) : null}
                    </div>
                  )}
                </section>
              ) : null}

              {customerType === "new" ? (
                <section className={styles.formSection}>
                  <div className={styles.formGrid}>
                    <label className="staff-form-group">
                      <span>Customer name</span>
                      <input
                        value={newCustomerName}
                        onChange={(event) =>
                          setNewCustomerName(event.target.value)
                        }
                        placeholder="Example: Jean Claude"
                        required
                      />
                    </label>

                    <label className="staff-form-group">
                      <span>Phone</span>
                      <input
                        value={newCustomerPhone}
                        onChange={(event) =>
                          setNewCustomerPhone(event.target.value)
                        }
                        placeholder="Example: 0783333333"
                      />
                    </label>

                    <label className="staff-form-group">
                      <span>Address</span>
                      <input
                        value={newCustomerAddress}
                        onChange={(event) =>
                          setNewCustomerAddress(event.target.value)
                        }
                        placeholder="Example: Kigali"
                      />
                    </label>

                    <label className="staff-form-group">
                      <span>Customer notes</span>
                      <input
                        value={newCustomerNotes}
                        onChange={(event) =>
                          setNewCustomerNotes(event.target.value)
                        }
                        placeholder="Example: Promised to pay in installments"
                      />
                    </label>
                  </div>
                </section>
              ) : null}

              <section className={styles.formSection}>
                <div className={styles.sectionTop}>
                  <div className="staff-form-section-title">Products sold</div>

                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={addItemRow}
                  >
                    <Plus size={13} />
                    Add product
                  </button>
                </div>

                <div className={styles.itemStack}>
                  {items.map((item, index) => {
                    const product = products.find(
                      (productItem) => productItem.id === item.productId,
                    );

                    const lineTotal =
                      Number(item.quantity || 0) *
                      Number(item.unitPriceRwf || 0);

                    return (
                      <div key={item.rowId} className={styles.itemCard}>
                        <div className={styles.itemCardTop}>
                          <strong>Item {index + 1}</strong>

                          <button
                            type="button"
                            className="btn btn-red-outline btn-sm"
                            onClick={() => removeItemRow(item.rowId)}
                            disabled={items.length === 1}
                          >
                            <Trash2 size={13} />
                            Remove
                          </button>
                        </div>

                        <div className={styles.itemGrid}>
                          <label className="staff-form-group">
                            <span>Product</span>
                            <select
                              value={item.productId}
                              onChange={(event) =>
                                updateItem(
                                  item.rowId,
                                  "productId",
                                  event.target.value,
                                )
                              }
                              required
                            >
                              <option value="">Choose product</option>
                              {activeProducts.map((productItem) => (
                                <option
                                  key={productItem.id}
                                  value={productItem.id}
                                  disabled={productItem.currentStock <= 0}
                                >
                                  {productItem.name} · Stock:{" "}
                                  {productItem.currentStock} ·{" "}
                                  {formatRwf(productItem.sellingPriceRwf)}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="staff-form-group">
                            <span>Quantity</span>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(event) =>
                                updateItem(
                                  item.rowId,
                                  "quantity",
                                  event.target.value,
                                )
                              }
                              required
                            />
                          </label>

                          <label className="staff-form-group">
                            <span>Selling price</span>
                            <input
                              type="number"
                              min={0}
                              value={item.unitPriceRwf}
                              onChange={(event) =>
                                updateItem(
                                  item.rowId,
                                  "unitPriceRwf",
                                  event.target.value,
                                )
                              }
                              required
                            />
                          </label>

                          <div className={styles.lineTotalBox}>
                            <span>Line total</span>
                            <strong>{formatRwf(lineTotal)}</strong>
                          </div>
                        </div>

                        {product ? (
                          <div className={styles.badgeRow}>
                            <span className="badge badge-blue">
                              Current stock: {product.currentStock}
                            </span>
                            <span className="badge badge-orange">
                              Minimum price:{" "}
                              {formatRwf(product.minSellingPriceRwf)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className={styles.formSection}>
                <div className="staff-form-section-title">Payment</div>

                <div className={styles.paymentGrid}>
                  <ChoiceCard
                    title="Paid now"
                    text="Full amount is paid immediately."
                    selected={paymentMode === "paid_now"}
                    onClick={() => switchPaymentMode("paid_now")}
                  />

                  <ChoiceCard
                    title="Deposit"
                    text="Saved customer pays part now."
                    selected={paymentMode === "partial"}
                    disabled={creditDisabledForWalkIn}
                    onClick={() => switchPaymentMode("partial")}
                  />

                  <ChoiceCard
                    title="Pay later"
                    text="Saved customer promises one payment."
                    selected={paymentMode === "pay_later"}
                    disabled={creditDisabledForWalkIn}
                    onClick={() => switchPaymentMode("pay_later")}
                  />

                  <ChoiceCard
                    title="Installments"
                    text="Saved customer pays balance in parts."
                    selected={paymentMode === "installment"}
                    disabled={creditDisabledForWalkIn}
                    onClick={() => switchPaymentMode("installment")}
                  />
                </div>
              </section>

              <section className={styles.formSection}>
                <div className={styles.formGrid}>
                  {paymentMode === "partial" ||
                  paymentMode === "installment" ? (
                    <label className="staff-form-group">
                      <span>
                        {paymentMode === "installment"
                          ? "Deposit paid now"
                          : "Amount paid now"}
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={amountPaidRwf}
                        onChange={(event) =>
                          setAmountPaidRwf(event.target.value)
                        }
                      />
                    </label>
                  ) : null}

                  <label className="staff-form-group">
                    <span>Payment method</span>
                    <select
                      value={paymentMethod}
                      onChange={(event) =>
                        setPaymentMethod(
                          event.target.value as SalePaymentMethod,
                        )
                      }
                    >
                      <option value="cash">Cash</option>
                      <option value="momo">MoMo</option>
                      <option value="bank">Bank</option>
                      <option value="card">Card</option>
                      <option value="other">Other</option>
                    </select>
                  </label>

                  {balanceRwf > 0 && paymentMode !== "installment" ? (
                    <label className="staff-form-group">
                      <span>Expected payment time</span>
                      <input
                        type="datetime-local"
                        value={expectedPaymentAt}
                        onChange={(event) =>
                          setExpectedPaymentAt(event.target.value)
                        }
                      />
                    </label>
                  ) : null}

                  <label className="staff-form-group">
                    <span>Payment note</span>
                    <input
                      value={paymentNote}
                      onChange={(event) => setPaymentNote(event.target.value)}
                      placeholder={
                        customerType === "walk_in"
                          ? "Example: Walk-in paid full amount"
                          : "Example: Customer promised to pay later"
                      }
                    />
                  </label>
                </div>
              </section>

              {paymentMode === "installment" ? (
                <section className={styles.installmentBox}>
                  <div className="staff-form-section-title">
                    Installment plan
                  </div>

                  <div className={styles.installmentGrid}>
                    <label className="staff-form-group">
                      <span>Number of installments</span>
                      <input
                        type="number"
                        min={1}
                        max={36}
                        value={numberOfInstallments}
                        onChange={(event) =>
                          setNumberOfInstallments(event.target.value)
                        }
                      />
                    </label>

                    <label className="staff-form-group">
                      <span>Frequency</span>
                      <select
                        value={installmentFrequency}
                        onChange={(event) =>
                          setInstallmentFrequency(
                            event.target.value as InstallmentFrequency,
                          )
                        }
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </label>

                    <label className="staff-form-group">
                      <span>First installment due</span>
                      <input
                        type="datetime-local"
                        value={firstInstallmentDueAt}
                        onChange={(event) =>
                          setFirstInstallmentDueAt(event.target.value)
                        }
                      />
                    </label>

                    <div className={styles.balanceBox}>
                      <span>Balance to split</span>
                      <strong>{formatRwf(balanceRwf)}</strong>
                    </div>
                  </div>

                  <div className={styles.installmentList}>
                    {installmentPreview.map((installment) => (
                      <div
                        key={installment.number}
                        className={styles.installmentRow}
                      >
                        <span>Installment {installment.number}</span>
                        <strong>{formatRwf(installment.amount)}</strong>
                        <span>
                          {formatDate(installment.dueDate.toISOString())}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className={styles.formSection}>
                <label className="staff-form-group">
                  <span>Sale notes</span>
                  <textarea
                    value={saleNotes}
                    onChange={(event) => setSaleNotes(event.target.value)}
                    placeholder={
                      customerType === "walk_in"
                        ? "Example: Walk-in customer paid now."
                        : "Example: Customer took product and will pay in installments."
                    }
                  />
                </label>
              </section>

              <section className={styles.summaryBox}>
                <div className={styles.summaryHeader}>
                  <div>
                    <div className="staff-form-section-title">Sale summary</div>
                    <p>Confirm money before saving the sale.</p>
                  </div>

                  <span
                    className={
                      balanceRwf > 0
                        ? "badge badge-orange"
                        : "badge badge-green"
                    }
                  >
                    {balanceRwf > 0 ? "Balance left" : "Fully paid"}
                  </span>
                </div>

                <div className={styles.summaryTotalCard}>
                  <span>Total sale amount</span>
                  <strong>{formatRwf(totalAmountRwf)}</strong>
                </div>

                <div className={styles.summaryMoneyGrid}>
                  <SummaryMoneyItem
                    label="Paid now"
                    value={formatRwf(finalAmountPaidRwf)}
                    tone="paid"
                  />

                  <SummaryMoneyItem
                    label="Balance"
                    value={formatRwf(balanceRwf)}
                    tone={balanceRwf > 0 ? "balance" : "clear"}
                  />
                </div>

                <div className={styles.summaryBadges}>
                  {paymentMode === "installment" && balanceRwf > 0 ? (
                    <div className="badge badge-orange">
                      <CalendarClock size={13} />
                      Installment plan will be created after saving
                    </div>
                  ) : null}

                  {customerType === "walk_in" && balanceRwf === 0 ? (
                    <div className="badge badge-green">
                      <CheckCircle2 size={13} />
                      Walk-in sale is fully paid
                    </div>
                  ) : null}
                </div>
              </section>

              <div className={styles.formFooter}>
                <button
                  type="button"
                  className="staff-btn staff-btn-outline"
                  onClick={resetSaleForm}
                >
                  Reset
                </button>

                <AsyncButton
                  loading={saving}
                  disabled={!isCashOpen}
                  type="submit"
                >
                  <Plus size={15} />
                  Save sale
                </AsyncButton>
              </div>
            </form>
          </section>

          <section className={`table-card premium-panel ${styles.recentPanel}`}>
            <div className="table-card-header">
              <div>
                <div className="table-title">Recent sales</div>
                <div className="app-subtitle">
                  Search recent sales and open the full sale record.
                </div>
              </div>

              <span className="badge badge-blue">
                {filteredRecentSales.length} record(s)
              </span>
            </div>

            <div className={styles.recentTools}>
              <div className="hdr-search">
                <Search size={14} />
                <input
                  value={recentSalesSearch}
                  onChange={(event) => {
                    setRecentSalesSearch(event.target.value);
                    setVisibleSalesCount(8);
                  }}
                  placeholder="Search sale number, customer, or seller..."
                />
              </div>
            </div>

            <div className={styles.recentList}>
              {visibleRecentSales.map((sale) => (
                <div key={sale.id} className={styles.saleCard}>
                  <div className={styles.saleCardIcon}>
                    <ShoppingCart size={17} />
                  </div>

                  <div className={styles.saleCardBody}>
                    <div className={styles.saleCardTop}>
                      <strong>{sale.saleNumber}</strong>

                      <span
                        className={
                          sale.balanceRwf > 0
                            ? "badge badge-orange"
                            : "badge badge-green"
                        }
                      >
                        {sale.balanceRwf > 0 ? "Balance" : "Paid"}
                      </span>
                    </div>

                    <span>
                      {sale.customerName ||
                        sale.walkInName ||
                        "Walk-in customer"}{" "}
                      · {formatRwf(sale.totalAmountRwf)}
                    </span>

                    <span>
                      Paid: {formatRwf(sale.amountPaidRwf)} · Balance:{" "}
                      {formatRwf(sale.balanceRwf)}
                    </span>

                    <span>Sold by {sale.soldByName || "Unknown"}</span>

                    {sale.balanceRwf > 0 ? (
                      <span>
                        Expected payment: {formatDate(sale.expectedPaymentAt)}
                      </span>
                    ) : null}

                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => router.push(`/sales/${sale.id}`)}
                    >
                      <Eye size={13} />
                      View sale
                    </button>
                  </div>
                </div>
              ))}

              {filteredRecentSales.length === 0 ? (
                <div className={styles.saleCard}>
                  <div className={styles.saleCardIcon}>
                    <Search size={17} />
                  </div>

                  <div className={styles.saleCardBody}>
                    <strong>No sales found</strong>
                    <span>
                      Try another sale number, customer name, or seller name.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {hasMoreRecentSales ? (
              <div className={styles.recentFooter}>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setVisibleSalesCount((current) => current + 8)}
                >
                  Load more sales
                </button>
              </div>
            ) : null}
          </section>
        </div>
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

type ChoiceCardProps = {
  title: string;
  text: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function ChoiceCard({
  title,
  text,
  selected,
  disabled = false,
  onClick,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cx(
        styles.choiceCard,
        selected && styles.choiceCardSelected,
        disabled && styles.choiceCardDisabled,
      )}
      onClick={onClick}
    >
      <strong>{title}</strong>
      <span>{text}</span>
    </button>
  );
}

type SummaryMoneyItemProps = {
  label: string;
  value: string;
  tone: "paid" | "balance" | "clear";
};

function SummaryMoneyItem({ label, value, tone }: SummaryMoneyItemProps) {
  return (
    <div
      className={cx(
        styles.summaryMoneyItem,
        tone === "paid" && styles.summaryMoneyPaid,
        tone === "balance" && styles.summaryMoneyBalance,
        tone === "clear" && styles.summaryMoneyClear,
      )}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
