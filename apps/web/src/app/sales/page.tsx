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

  if (frequency === "daily") date.setDate(date.getDate() + step);
  if (frequency === "weekly") date.setDate(date.getDate() + step * 7);
  if (frequency === "monthly") date.setMonth(date.getMonth() + step);

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
  const [visibleSalesCount, setVisibleSalesCount] = useState(5);

  const isCashOpen = cashSession?.status === "open";

  const cashMessage = !cashSession
    ? "Cash is not open. Open cash before creating sales."
    : cashSession.status === "closed"
      ? "Cash is closed. Sales are blocked for this business date."
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

    if (!term) return activeCustomers.slice(0, 6);

    return activeCustomers
      .filter((customer) => {
        return (
          customer.name.toLowerCase().includes(term) ||
          (customer.phone || "").toLowerCase().includes(term) ||
          (customer.address || "").toLowerCase().includes(term)
        );
      })
      .slice(0, 6);
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
      return (
        sale.saleNumber.toLowerCase().includes(term) ||
        (sale.customerName || "").toLowerCase().includes(term) ||
        (sale.walkInName || "").toLowerCase().includes(term) ||
        (sale.soldByName || "").toLowerCase().includes(term)
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

      return {
        number: index + 1,
        amount: isLast ? baseAmount + remainder : baseAmount,
        dueDate: addFrequency(firstDueDate, installmentFrequency, index),
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
      setVisibleSalesCount(5);
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
        "Walk-in customers cannot buy on credit. Choose existing customer or new customer.",
      );
      return;
    }

    setMessage("");
    setPaymentMode(mode);

    if (mode === "paid_now") setAmountPaidRwf(String(totalAmountRwf));
    if (mode === "pay_later") setAmountPaidRwf("0");
    if (mode === "partial" || mode === "installment") setAmountPaidRwf("0");
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
      setMessage("Choose product, quantity, and selling price correctly.");
      return;
    }

    if (customerType === "walk_in" && paymentMode !== "paid_now") {
      setMessage("Walk-in customers must pay full amount now.");
      return;
    }

    if (customerType === "walk_in" && balanceRwf > 0) {
      setMessage("Walk-in customers cannot have balance.");
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
        setMessage("Installment plan needs remaining balance.");
        return;
      }

      if (!count || count < 1) {
        setMessage("Number of installments must be at least 1.");
        return;
      }

      if (!firstInstallmentDueAt) {
        setMessage("Choose first installment due date.");
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
        <section className={styles.posHeader}>
          <div>
            <span className={styles.kicker}>
              <ShoppingCart size={15} />
              POS checkout
            </span>

            <h1>Sell</h1>

            <p>Choose customer, add products, confirm payment, save sale.</p>
          </div>

          <div className={styles.headerActions}>
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
                Open cash
              </button>
            ) : null}
          </div>
        </section>

        {!isCashOpen ? (
          <NoticeCard
            title="Selling is blocked"
            text={cashMessage}
            actionLabel="Open cash"
            onAction={() => router.push("/cash")}
          />
        ) : (
          <section className={styles.readyCard}>
            <CheckCircle2 size={20} />
            <div>
              <strong>Ready to sell</strong>
              <span>Cash is open. Start with customer, then products.</span>
            </div>
          </section>
        )}

        <div className={styles.posLayout}>
          <form onSubmit={handleCreateSale} className={styles.checkoutPanel}>
            <section className={styles.checkoutStep}>
              <StepTitle number="1" title="Customer" />

              <div className={styles.customerTypeGrid}>
                <ChoiceCard
                  title="Walk-in"
                  text="Paid now"
                  selected={customerType === "walk_in"}
                  onClick={() => chooseCustomerType("walk_in")}
                />

                <ChoiceCard
                  title="Existing"
                  text="Can owe"
                  selected={customerType === "existing"}
                  onClick={() => chooseCustomerType("existing")}
                />

                <ChoiceCard
                  title="New"
                  text="Save customer"
                  selected={customerType === "new"}
                  onClick={() => chooseCustomerType("new")}
                />
              </div>

              {customerType === "walk_in" ? (
                <div className={styles.simpleGrid}>
                  <label className="staff-form-group">
                    <span>Name</span>
                    <input
                      value={walkInName}
                      onChange={(event) => setWalkInName(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              {customerType === "existing" ? (
                <div className={styles.customerBlock}>
                  <label className="staff-form-group">
                    <span>Find customer</span>
                    <div className="hdr-search">
                      <Search size={14} />
                      <input
                        value={customerSearch}
                        onChange={(event) => {
                          setCustomerSearch(event.target.value);
                          setCustomerId("");
                        }}
                        placeholder="Name or phone..."
                      />
                    </div>
                  </label>

                  {selectedCustomer ? (
                    <div className={styles.selectedCustomer}>
                      <User size={17} />
                      <div>
                        <strong>{selectedCustomer.name}</strong>
                        <span>{selectedCustomer.phone || "No phone"}</span>
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
                            <span>{customer.phone || "No phone"}</span>
                          </div>

                          <span className="badge badge-blue">Choose</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {customerType === "new" ? (
                <div className={styles.simpleGrid}>
                  <label className="staff-form-group">
                    <span>Name</span>
                    <input
                      value={newCustomerName}
                      onChange={(event) =>
                        setNewCustomerName(event.target.value)
                      }
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
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Address</span>
                    <input
                      value={newCustomerAddress}
                      onChange={(event) =>
                        setNewCustomerAddress(event.target.value)
                      }
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Notes</span>
                    <input
                      value={newCustomerNotes}
                      onChange={(event) =>
                        setNewCustomerNotes(event.target.value)
                      }
                    />
                  </label>
                </div>
              ) : null}
            </section>

            <section className={styles.checkoutStep}>
              <div className={styles.stepTop}>
                <StepTitle number="2" title="Products" />

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
                    Number(item.quantity || 0) * Number(item.unitPriceRwf || 0);

                  return (
                    <article key={item.rowId} className={styles.saleItem}>
                      <div className={styles.saleItemTop}>
                        <strong>Item {index + 1}</strong>

                        <button
                          type="button"
                          className={styles.removeButton}
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
                          <span>Qty</span>
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
                          <span>Price</span>
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
                          <span>Total</span>
                          <strong>{formatRwf(lineTotal)}</strong>
                        </div>
                      </div>

                      {product ? (
                        <div className={styles.itemMeta}>
                          <span>Stock: {product.currentStock}</span>
                          <span>
                            Minimum: {formatRwf(product.minSellingPriceRwf)}
                          </span>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className={styles.checkoutStep}>
              <StepTitle number="3" title="Payment" />

              <div className={styles.paymentGrid}>
                <ChoiceCard
                  title="Paid now"
                  text="Full"
                  selected={paymentMode === "paid_now"}
                  onClick={() => switchPaymentMode("paid_now")}
                />

                <ChoiceCard
                  title="Deposit"
                  text="Part"
                  selected={paymentMode === "partial"}
                  disabled={creditDisabledForWalkIn}
                  onClick={() => switchPaymentMode("partial")}
                />

                <ChoiceCard
                  title="Pay later"
                  text="Future"
                  selected={paymentMode === "pay_later"}
                  disabled={creditDisabledForWalkIn}
                  onClick={() => switchPaymentMode("pay_later")}
                />

                <ChoiceCard
                  title="Installments"
                  text="Split"
                  selected={paymentMode === "installment"}
                  disabled={creditDisabledForWalkIn}
                  onClick={() => switchPaymentMode("installment")}
                />
              </div>

              <div className={styles.simpleGrid}>
                {paymentMode === "partial" || paymentMode === "installment" ? (
                  <label className="staff-form-group">
                    <span>Paid now</span>
                    <input
                      type="number"
                      min={0}
                      value={amountPaidRwf}
                      onChange={(event) => setAmountPaidRwf(event.target.value)}
                    />
                  </label>
                ) : null}

                <label className="staff-form-group">
                  <span>Method</span>
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
                    <span>Expected payment</span>
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
                    placeholder="Optional"
                  />
                </label>
              </div>

              {paymentMode === "installment" ? (
                <div className={styles.installmentBox}>
                  <div className={styles.simpleGrid}>
                    <label className="staff-form-group">
                      <span>Installments</span>
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
                      <span>First due</span>
                      <input
                        type="datetime-local"
                        value={firstInstallmentDueAt}
                        onChange={(event) =>
                          setFirstInstallmentDueAt(event.target.value)
                        }
                      />
                    </label>
                  </div>

                  <div className={styles.installmentList}>
                    {installmentPreview.map((installment) => (
                      <div
                        key={installment.number}
                        className={styles.installmentRow}
                      >
                        <span>#{installment.number}</span>
                        <strong>{formatRwf(installment.amount)}</strong>
                        <span>
                          {formatDate(installment.dueDate.toISOString())}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="staff-form-group">
                <span>Sale note</span>
                <textarea
                  value={saleNotes}
                  onChange={(event) => setSaleNotes(event.target.value)}
                  placeholder="Optional"
                />
              </label>
            </section>

            {message ? (
              <div className={styles.messageBox}>{message}</div>
            ) : null}

            <div className={styles.mobileTotal}>
              <TotalBox
                total={totalAmountRwf}
                paid={finalAmountPaidRwf}
                balance={balanceRwf}
              />

              <div className={styles.mobileActions}>
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
            </div>
          </form>

          <aside className={styles.checkoutSidebar}>
            <TotalBox
              total={totalAmountRwf}
              paid={finalAmountPaidRwf}
              balance={balanceRwf}
            />

            <div className={styles.sidebarActions}>
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

            <section className={styles.recentPanel}>
              <div className={styles.recentTop}>
                <div>
                  <h2>Recent sales</h2>
                  <p>Only latest important records.</p>
                </div>

                {loading ? <Loader2 className="spin" size={18} /> : null}
              </div>

              <div className={styles.recentSearch}>
                <div className="hdr-search">
                  <Search size={14} />
                  <input
                    value={recentSalesSearch}
                    onChange={(event) => {
                      setRecentSalesSearch(event.target.value);
                      setVisibleSalesCount(5);
                    }}
                    placeholder="Search sale..."
                  />
                </div>
              </div>

              <div className={styles.salesList}>
                {visibleRecentSales.map((sale) => (
                  <article key={sale.id} className={styles.salesRow}>
                    <div className={styles.saleMain}>
                      <div className={styles.saleIcon}>
                        <ShoppingCart size={16} />
                      </div>

                      <div>
                        <strong>{sale.saleNumber}</strong>
                        <span>
                          {sale.customerName ||
                            sale.walkInName ||
                            "Walk-in customer"}
                        </span>
                      </div>
                    </div>

                    <div className={styles.saleAmount}>
                      <strong>{formatRwf(sale.totalAmountRwf)}</strong>
                      <span
                        className={
                          sale.balanceRwf > 0
                            ? styles.statusPending
                            : styles.statusPaid
                        }
                      >
                        {sale.balanceRwf > 0 ? "Balance" : "Paid"}
                      </span>
                    </div>

                    <button
                      type="button"
                      className={styles.viewButton}
                      onClick={() => router.push(`/sales/${sale.id}`)}
                    >
                      <Eye size={13} />
                      View
                    </button>
                  </article>
                ))}

                {filteredRecentSales.length === 0 ? (
                  <EmptyCard
                    icon={<Search size={22} />}
                    title="No sales found"
                    text="Try another sale number or customer."
                  />
                ) : null}
              </div>

              {hasMoreRecentSales ? (
                <button
                  className={styles.loadMoreButton}
                  type="button"
                  onClick={() => setVisibleSalesCount((current) => current + 5)}
                >
                  Show 5 more sales
                </button>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function StepTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className={styles.stepTitle}>
      <span>{number}</span>
      <strong>{title}</strong>
    </div>
  );
}

function NoticeCard({
  title,
  text,
  actionLabel,
  onAction,
}: {
  title: string;
  text: string;
  actionLabel: string;
  onAction: () => void;
}) {
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

function ChoiceCard({
  title,
  text,
  selected,
  disabled = false,
  onClick,
}: {
  title: string;
  text: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
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

function TotalBox({
  total,
  paid,
  balance,
}: {
  total: number;
  paid: number;
  balance: number;
}) {
  return (
    <section className={styles.totalBox}>
      <div className={styles.totalHeader}>
        <span>Sale total</span>
        <strong>{formatRwf(total)}</strong>
      </div>

      <div className={styles.totalGrid}>
        <div>
          <span>Paid</span>
          <strong>{formatRwf(paid)}</strong>
        </div>

        <div className={balance > 0 ? styles.balanceDue : ""}>
          <span>Balance</span>
          <strong>{formatRwf(balance)}</strong>
        </div>
      </div>

      <div
        className={
          balance > 0 ? styles.totalStatusWarning : styles.totalStatusSuccess
        }
      >
        {balance > 0 ? "Customer will owe balance" : "Fully paid"}
      </div>
    </section>
  );
}

function EmptyCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className={styles.emptyCard}>
      <div>{icon}</div>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
