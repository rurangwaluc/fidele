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
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  InstallmentFrequency,
  SaleCustomerType,
  SaleListItem,
  SalePaymentMethod,
  createSale,
  getSales,
} from "@/lib/sales";
import { Product, getProducts } from "@/lib/products";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import { getToken } from "@/lib/auth";
import { useRouter } from "next/navigation";

type SaleItemForm = {
  rowId: string;
  productId: string;
  quantity: string;
  unitPriceRwf: string;
};

type PaymentMode = "paid_now" | "partial" | "pay_later" | "installment";

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
      <section className="dashboard-hero">
        <div>
          <span className="hero-kicker dashboard-kicker">
            <ShoppingCart size={15} />
            Sales and pay later
          </span>

          <h1>Create sale</h1>

          <p>
            Walk-in customers must pay now. Deposit, pay later, and installments
            require a saved customer profile.
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
                Selling is blocked
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
              <ShoppingCart size={20} />
            </div>
            <span className="badge badge-blue">Sales</span>
          </div>
          <div className="stat-label">Sales records</div>
          <div className="stat-value">{sales.length}</div>
          <div className="stat-help">Latest sales in the system</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <CheckCircle2 size={20} />
            </div>
            <span className="badge badge-green">Paid</span>
          </div>
          <div className="stat-label">Paid sales</div>
          <div className="stat-value">{paidSales.length}</div>
          <div className="stat-help">Sales with no remaining balance</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <WalletCards size={20} />
            </div>
            <span className="badge badge-orange">Debt</span>
          </div>
          <div className="stat-label">Credit sales</div>
          <div className="stat-value">{unpaidSales.length}</div>
          <div className="stat-help">
            Saved customers with remaining balance
          </div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <Package size={20} />
            </div>
            <span className="badge badge-blue">Stock</span>
          </div>
          <div className="stat-label">Available products</div>
          <div className="stat-value">{activeProducts.length}</div>
          <div className="stat-help">Products ready for selling</div>
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

      <div className="dashboard-grid">
        <section className="table-card premium-panel">
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

          <form onSubmit={handleCreateSale} className="staff-modal-body">
            <div>
              <div className="staff-form-section-title">Customer</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <button
                  type="button"
                  className={
                    customerType === "walk_in"
                      ? "staff-responsibility selected"
                      : "staff-responsibility"
                  }
                  onClick={() => chooseCustomerType("walk_in")}
                >
                  <div>
                    <strong>Walk-in</strong>
                    <p>Paid now only. No credit.</p>
                  </div>
                </button>

                <button
                  type="button"
                  className={
                    customerType === "existing"
                      ? "staff-responsibility selected"
                      : "staff-responsibility"
                  }
                  onClick={() => chooseCustomerType("existing")}
                >
                  <div>
                    <strong>Existing</strong>
                    <p>Can pay now, later, or installments.</p>
                  </div>
                </button>

                <button
                  type="button"
                  className={
                    customerType === "new"
                      ? "staff-responsibility selected"
                      : "staff-responsibility"
                  }
                  onClick={() => chooseCustomerType("new")}
                >
                  <div>
                    <strong>New customer</strong>
                    <p>Create customer for credit sale.</p>
                  </div>
                </button>
              </div>
            </div>

            {customerType === "walk_in" ? (
              <>
                <label className="staff-form-group">
                  <span>Walk-in name</span>
                  <input
                    value={walkInName}
                    onChange={(event) => setWalkInName(event.target.value)}
                  />
                </label>

                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    padding: 14,
                    background: "var(--gold-lt)",
                    color: "var(--gray-900)",
                    fontWeight: 800,
                  }}
                >
                  Walk-in customers must pay the full amount immediately. To
                  allow deposit, pay later, or installments, choose Existing
                  customer or New customer.
                </div>
              </>
            ) : null}

            {customerType === "existing" ? (
              <div>
                <label className="staff-form-group">
                  <span>Search existing customer</span>
                  <div className="hdr-search" style={{ width: "100%" }}>
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
                  <div
                    style={{
                      marginTop: 10,
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 12,
                      background: "var(--gold-lt)",
                      color: "var(--gray-900)",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <User size={17} />
                      <div>
                        <strong>{selectedCustomer.name}</strong>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            fontWeight: 800,
                            color: "var(--gray-600)",
                          }}
                        >
                          {selectedCustomer.phone || "No phone"} ·{" "}
                          {selectedCustomer.address || "No address"}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 10,
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: 8,
                    }}
                  >
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => chooseExistingCustomer(customer)}
                        style={{
                          width: "100%",
                          border: "1px solid var(--border)",
                          background: "var(--card)",
                          color: "var(--gray-900)",
                          borderRadius: 14,
                          padding: 12,
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <strong>{customer.name}</strong>
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 12,
                                color: "var(--gray-500)",
                                fontWeight: 800,
                              }}
                            >
                              {customer.phone || "No phone"} ·{" "}
                              {customer.address || "No address"}
                            </div>
                          </div>

                          <span className="badge badge-blue">Choose</span>
                        </div>
                      </button>
                    ))}

                    {filteredCustomers.length === 0 ? (
                      <div
                        style={{
                          border: "1px solid var(--border)",
                          background: "var(--gray-50)",
                          color: "var(--gray-500)",
                          borderRadius: 14,
                          padding: 14,
                          fontWeight: 800,
                        }}
                      >
                        No customer found. Use “New customer” to create one.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {customerType === "new" ? (
              <div className="staff-form-grid">
                <label className="staff-form-group">
                  <span>Customer name</span>
                  <input
                    value={newCustomerName}
                    onChange={(event) => setNewCustomerName(event.target.value)}
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
            ) : null}

            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
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

              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {items.map((item, index) => {
                  const product = products.find(
                    (productItem) => productItem.id === item.productId,
                  );

                  const lineTotal =
                    Number(item.quantity || 0) * Number(item.unitPriceRwf || 0);

                  return (
                    <div
                      key={item.rowId}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        padding: 14,
                        background: "var(--gray-50)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          marginBottom: 12,
                        }}
                      >
                        <strong style={{ color: "var(--gray-900)" }}>
                          Item {index + 1}
                        </strong>

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

                      <div className="staff-form-grid">
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

                        <div>
                          <div className="staff-form-section-title">
                            Line total
                          </div>
                          <div
                            style={{
                              marginTop: 8,
                              fontWeight: 900,
                              color: "var(--gray-900)",
                              fontSize: 18,
                            }}
                          >
                            {formatRwf(lineTotal)}
                          </div>
                        </div>
                      </div>

                      {product ? (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            marginTop: 12,
                          }}
                        >
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
            </div>

            <div>
              <div className="staff-form-section-title">Payment</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <button
                  type="button"
                  className={
                    paymentMode === "paid_now"
                      ? "staff-responsibility selected"
                      : "staff-responsibility"
                  }
                  onClick={() => switchPaymentMode("paid_now")}
                >
                  <div>
                    <strong>Paid now</strong>
                    <p>Full amount is paid immediately.</p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={creditDisabledForWalkIn}
                  className={
                    paymentMode === "partial"
                      ? "staff-responsibility selected"
                      : "staff-responsibility"
                  }
                  onClick={() => switchPaymentMode("partial")}
                  style={{
                    opacity: creditDisabledForWalkIn ? 0.45 : 1,
                    cursor: creditDisabledForWalkIn ? "not-allowed" : "pointer",
                  }}
                >
                  <div>
                    <strong>Deposit</strong>
                    <p>Saved customer pays part now.</p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={creditDisabledForWalkIn}
                  className={
                    paymentMode === "pay_later"
                      ? "staff-responsibility selected"
                      : "staff-responsibility"
                  }
                  onClick={() => switchPaymentMode("pay_later")}
                  style={{
                    opacity: creditDisabledForWalkIn ? 0.45 : 1,
                    cursor: creditDisabledForWalkIn ? "not-allowed" : "pointer",
                  }}
                >
                  <div>
                    <strong>Pay later</strong>
                    <p>Saved customer promises one payment.</p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={creditDisabledForWalkIn}
                  className={
                    paymentMode === "installment"
                      ? "staff-responsibility selected"
                      : "staff-responsibility"
                  }
                  onClick={() => switchPaymentMode("installment")}
                  style={{
                    opacity: creditDisabledForWalkIn ? 0.45 : 1,
                    cursor: creditDisabledForWalkIn ? "not-allowed" : "pointer",
                  }}
                >
                  <div>
                    <strong>Installments</strong>
                    <p>Saved customer pays balance in parts.</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="staff-form-grid">
              {paymentMode === "partial" || paymentMode === "installment" ? (
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
                    onChange={(event) => setAmountPaidRwf(event.target.value)}
                  />
                </label>
              ) : null}

              <label className="staff-form-group">
                <span>Payment method</span>
                <select
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value as SalePaymentMethod)
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

            {paymentMode === "installment" ? (
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  padding: 16,
                  background: "var(--gray-50)",
                }}
              >
                <div className="staff-form-section-title">Installment plan</div>

                <div className="staff-form-grid" style={{ marginTop: 12 }}>
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

                  <div>
                    <div className="staff-form-section-title">
                      Balance to split
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 22,
                        fontWeight: 900,
                        color: "var(--gray-900)",
                      }}
                    >
                      {formatRwf(balanceRwf)}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                  {installmentPreview.map((installment) => (
                    <div
                      key={installment.number}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: 10,
                        background: "var(--card)",
                        color: "var(--gray-900)",
                        fontWeight: 800,
                      }}
                    >
                      <span>Installment {installment.number}</span>
                      <span>{formatRwf(installment.amount)}</span>
                      <span>
                        {formatDate(installment.dueDate.toISOString())}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

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

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: 16,
                background: "var(--gray-50)",
              }}
            >
              <div className="staff-form-section-title">Sale summary</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <div>
                  <div className="stat-label">Total</div>
                  <div className="stat-value" style={{ fontSize: 22 }}>
                    {formatRwf(totalAmountRwf)}
                  </div>
                </div>

                <div>
                  <div className="stat-label">Paid now</div>
                  <div className="stat-value" style={{ fontSize: 22 }}>
                    {formatRwf(finalAmountPaidRwf)}
                  </div>
                </div>

                <div>
                  <div className="stat-label">Balance</div>
                  <div className="stat-value" style={{ fontSize: 22 }}>
                    {formatRwf(balanceRwf)}
                  </div>
                </div>
              </div>

              {paymentMode === "installment" && balanceRwf > 0 ? (
                <div style={{ marginTop: 12 }} className="badge badge-orange">
                  <CalendarClock size={13} />
                  Installment plan will be created after saving
                </div>
              ) : null}

              {customerType === "walk_in" && balanceRwf === 0 ? (
                <div style={{ marginTop: 12 }} className="badge badge-green">
                  <CheckCircle2 size={13} />
                  Walk-in sale is fully paid
                </div>
              ) : null}
            </div>

            <div className="staff-modal-footer">
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

        <section className="table-card premium-panel">
          <div className="table-card-header">
            <div>
              <div className="table-title">Recent sales</div>
              <div className="app-subtitle">
                Click view to open a full sale record.
              </div>
            </div>
          </div>

          <div className="attention-list">
            {sales.slice(0, 10).map((sale) => (
              <div key={sale.id} className="attention-item">
                <ShoppingCart size={17} />
                <div style={{ width: "100%" }}>
                  <strong>{sale.saleNumber}</strong>
                  <span>
                    {sale.customerName || sale.walkInName || "Walk-in customer"}{" "}
                    · {formatRwf(sale.totalAmountRwf)}
                  </span>
                  <span>
                    Paid: {formatRwf(sale.amountPaidRwf)} · Balance:{" "}
                    {formatRwf(sale.balanceRwf)} · Sold by{" "}
                    {sale.soldByName || "Unknown"}
                  </span>
                  {sale.balanceRwf > 0 ? (
                    <span>
                      Expected payment: {formatDate(sale.expectedPaymentAt)}
                    </span>
                  ) : null}

                  <div style={{ marginTop: 10 }}>
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
              </div>
            ))}

            {sales.length === 0 ? (
              <div className="attention-item">
                <Search size={17} />
                <div>
                  <strong>No sales yet</strong>
                  <span>Create your first sale from the form.</span>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
