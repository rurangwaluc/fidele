"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Minus,
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
  SalePaymentMethod,
  createSale,
} from "@/lib/sales";
import { Product, getProducts } from "@/lib/products";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import { getToken } from "@/lib/auth";
import { requestSpecialPrice } from "@/lib/special-price";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";

type CartItem = {
  rowId: string;
  productId: string;
  quantity: number;
  discountRwf: number;
  specialPriceReason: string;
  specialPriceRequested: boolean;
};

type PaymentMode = "paid_now" | "partial" | "pay_later" | "installment";

function makeRow(productId: string): CartItem {
  return {
    rowId: Math.random().toString(36).slice(2),
    productId,
    quantity: 1,
    discountRwf: 0,
    specialPriceReason: "",
    specialPriceRequested: false,
  };
}

function formatRwf(value: number) {
  return `Rwf ${Number(value || 0).toLocaleString("en-US")}`;
}

function makeEveningLocalValue() {
  const date = new Date();

  if (date.getHours() >= 20) date.setDate(date.getDate() + 1);

  date.setHours(20, 0, 0, 0);

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);

  return localDate.toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string) {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

export default function SalesPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestingApprovalId, setRequestingApprovalId] = useState("");
  const [message, setMessage] = useState("");

  const [customerType, setCustomerType] = useState<SaleCustomerType>("walk_in");
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [walkInName, setWalkInName] = useState("Walk-in customer");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  const [productSearch, setProductSearch] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const [paymentMode, setPaymentMode] = useState<PaymentMode>("paid_now");
  const [amountPaidRwf, setAmountPaidRwf] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>("cash");
  const [expectedPaymentAt, setExpectedPaymentAt] = useState("");
  const [numberOfInstallments, setNumberOfInstallments] = useState("3");
  const [installmentFrequency, setInstallmentFrequency] =
    useState<InstallmentFrequency>("weekly");

  const isCashOpen = cashSession?.status === "open";

  const cashMessage = !cashSession
    ? "Cash is not open. Open cash before creating sales."
    : cashSession.status === "closed"
      ? "Cash is closed. Sales are blocked."
      : "";

  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive),
    [products],
  );

  const activeCustomers = useMemo(
    () => customers.filter((customer) => customer.isActive),
    [customers],
  );

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();

    if (!term) return [];

    return activeProducts
      .filter((product) => {
        return (
          product.name.toLowerCase().includes(term) ||
          product.sku.toLowerCase().includes(term) ||
          (product.brand || "").toLowerCase().includes(term) ||
          (product.model || "").toLowerCase().includes(term) ||
          (product.categoryName || "").toLowerCase().includes(term)
        );
      })
      .slice(0, 10);
  }, [activeProducts, productSearch]);

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();

    if (!term) return activeCustomers.slice(0, 5);

    return activeCustomers
      .filter((customer) => {
        return (
          customer.name.toLowerCase().includes(term) ||
          (customer.phone || "").toLowerCase().includes(term)
        );
      })
      .slice(0, 5);
  }, [activeCustomers, customerSearch]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) || null,
    [customers, customerId],
  );

  const cartLines = useMemo(() => {
    return cartItems.map((item) => {
      const product = products.find(
        (productItem) => productItem.id === item.productId,
      );

      const normalPrice = Number(product?.sellingPriceRwf || 0);
      const minimumPrice = Number(product?.minSellingPriceRwf || 0);
      const discount = Math.max(0, Number(item.discountRwf || 0));
      const finalUnitPrice = Math.max(0, normalPrice - discount);
      const lineTotal = finalUnitPrice * item.quantity;
      const belowMinimum = Boolean(product && finalUnitPrice < minimumPrice);

      return {
        item,
        product,
        normalPrice,
        minimumPrice,
        discount,
        finalUnitPrice,
        lineTotal,
        belowMinimum,
      };
    });
  }, [cartItems, products]);

  const subtotalRwf = cartLines.reduce(
    (sum, line) => sum + line.normalPrice * line.item.quantity,
    0,
  );

  const totalDiscountRwf = cartLines.reduce(
    (sum, line) => sum + line.discount * line.item.quantity,
    0,
  );

  const totalAmountRwf = cartLines.reduce(
    (sum, line) => sum + line.lineTotal,
    0,
  );

  const finalAmountPaidRwf = useMemo(() => {
    if (paymentMode === "paid_now") return totalAmountRwf;
    if (paymentMode === "pay_later") return 0;
    return Number(amountPaidRwf || 0);
  }, [amountPaidRwf, paymentMode, totalAmountRwf]);

  const balanceRwf = Math.max(0, totalAmountRwf - finalAmountPaidRwf);
  const hasBelowMinimum = cartLines.some((line) => line.belowMinimum);
  const hasCart = cartLines.length > 0;
  const creditDisabledForWalkIn = customerType === "walk_in";

  useEffect(() => {
    setExpectedPaymentAt(makeEveningLocalValue());
    loadData();
  }, []);

  async function loadData() {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setMessage("");

    try {
      const [productsResponse, customersResponse, cashResponse] =
        await Promise.all([
          getProducts(token),
          getCustomers(token),
          getCashToday(token),
        ]);

      setProducts(productsResponse.products);
      setCustomers(customersResponse.customers);
      setCashSession(cashResponse.session);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load sales page.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetSale() {
    setCustomerType("walk_in");
    setCustomerId("");
    setCustomerSearch("");
    setWalkInName("Walk-in customer");
    setNewCustomerName("");
    setNewCustomerPhone("");
    setProductSearch("");
    setCartItems([]);
    setPaymentMode("paid_now");
    setAmountPaidRwf("0");
    setPaymentMethod("cash");
    setExpectedPaymentAt(makeEveningLocalValue());
    setNumberOfInstallments("3");
    setInstallmentFrequency("weekly");
    setMessage("");
  }

  function chooseCustomerType(type: SaleCustomerType) {
    setCustomerType(type);
    setCustomerId("");
    setCustomerSearch("");
    setMessage("");

    if (type === "walk_in") {
      setPaymentMode("paid_now");
      setAmountPaidRwf("0");
    }
  }

  function chooseExistingCustomer(customer: Customer) {
    setCustomerId(customer.id);
    setCustomerSearch(
      `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}`,
    );
  }

  function addProduct(product: Product) {
    if (product.currentStock <= 0) {
      setMessage(`${product.name} is out of stock.`);
      return;
    }

    setCartItems((current) => {
      const existing = current.find((item) => item.productId === product.id);

      if (existing) {
        return current.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: Math.min(product.currentStock, item.quantity + 1),
              }
            : item,
        );
      }

      return [...current, makeRow(product.id)];
    });

    setProductSearch("");
    setMessage("");
  }

  function updateCartItem(rowId: string, nextItem: Partial<CartItem>) {
    setCartItems((current) =>
      current.map((item) =>
        item.rowId === rowId
          ? {
              ...item,
              ...nextItem,
            }
          : item,
      ),
    );
  }

  function removeCartItem(rowId: string) {
    setCartItems((current) => current.filter((item) => item.rowId !== rowId));
  }

  function switchPaymentMode(mode: PaymentMode) {
    if (customerType === "walk_in" && mode !== "paid_now") {
      setMessage(
        "Walk-in customer must pay full amount now. Choose existing or new customer for credit.",
      );
      setPaymentMode("paid_now");
      return;
    }

    setMessage("");
    setPaymentMode(mode);

    if (mode === "paid_now") setAmountPaidRwf("0");
    if (mode === "pay_later") setAmountPaidRwf("0");
    if (mode === "partial" || mode === "installment") setAmountPaidRwf("0");
  }

  async function handleRequestSpecialPrice(rowId: string) {
    const token = getToken();
    if (!token) return;

    const line = cartLines.find((cartLine) => cartLine.item.rowId === rowId);

    if (!line?.product) {
      setMessage("Choose product before requesting approval.");
      return;
    }

    if (!line.belowMinimum) {
      setMessage("Approval is only needed when final price is below minimum.");
      return;
    }

    if (!line.item.specialPriceReason.trim()) {
      setMessage("Write the reason for special price approval.");
      return;
    }

    setRequestingApprovalId(rowId);
    setMessage("");

    try {
      await requestSpecialPrice(token, {
        productId: line.product.id,
        requestedPriceRwf: line.finalUnitPrice,
        quantity: line.item.quantity,
        reason: line.item.specialPriceReason,
      });

      updateCartItem(rowId, {
        specialPriceRequested: true,
      });

      setMessage(
        "Special price request sent. Wait for owner/manager approval.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not request special price.",
      );
    } finally {
      setRequestingApprovalId("");
    }
  }

  async function handleCreateSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isCashOpen) {
      setMessage(cashMessage || "Open cash before creating sales.");
      return;
    }

    if (!hasCart) {
      setMessage("Add at least one product to cart.");
      return;
    }

    if (hasBelowMinimum) {
      setMessage(
        "One product is below minimum price. Request approval before saving.",
      );
      return;
    }

    if (customerType === "existing" && !customerId) {
      setMessage("Choose an existing customer.");
      return;
    }

    if (customerType === "new" && !newCustomerName.trim()) {
      setMessage("Enter the new customer name.");
      return;
    }

    if (customerType === "walk_in" && balanceRwf > 0) {
      setMessage("Walk-in customer cannot have balance.");
      return;
    }

    if (finalAmountPaidRwf > totalAmountRwf) {
      setMessage("Amount paid cannot be greater than sale total.");
      return;
    }

    const invalidStock = cartLines.find(
      (line) => line.product && line.item.quantity > line.product.currentStock,
    );

    if (invalidStock?.product) {
      setMessage(
        `${invalidStock.product.name} has only ${invalidStock.product.currentStock} in stock.`,
      );
      return;
    }

    const token = getToken();
    if (!token) return;

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
              }
            : undefined,
        items: cartLines.map((line) => ({
          productId: line.item.productId,
          quantity: line.item.quantity,
          unitPriceRwf: line.finalUnitPrice,
        })),
        payment: {
          amountPaidRwf: finalAmountPaidRwf,
          method: paymentMethod,
          expectedPaymentAt:
            balanceRwf > 0 ? localDateTimeToIso(expectedPaymentAt) : undefined,
          installmentPlan:
            paymentMode === "installment"
              ? {
                  numberOfInstallments: Number(numberOfInstallments || 1),
                  frequency: installmentFrequency,
                  firstDueAt: localDateTimeToIso(expectedPaymentAt),
                }
              : undefined,
        },
        notes:
          totalDiscountRwf > 0
            ? `Discount given: ${formatRwf(totalDiscountRwf)}`
            : undefined,
      });

      resetSale();
      router.push(`/sales/${response.sale.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create sale.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Sales">
      <div className={styles.salesPage}>
        <section className={styles.posHero}>
          <div>
            <span className={styles.kicker}>
              <ShoppingCart size={15} />
              Seller POS
            </span>

            <h1>New Sale</h1>

            <p>
              Search product, add to cart, choose customer, and complete
              payment.
            </p>
          </div>

          <div className={styles.heroActions}>
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
              <span>Cash is open. Start by searching a product.</span>
            </div>
          </section>
        )}

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        <form
          id="sales-checkout-form"
          onSubmit={handleCreateSale}
          className={styles.posWorkspace}
        >
          <section className={styles.productPanel}>
            <PanelTitle
              number="1"
              title="Find product"
              text="Search only. No product list is shown until seller types."
            />

            <div className={styles.searchBox}>
              <Search size={16} />
              <input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Search product name, SKU, brand, model..."
                autoComplete="off"
              />
            </div>

            <div className={styles.productResults}>
              {loading ? (
                <div className={styles.loadingLine}>
                  <Loader2 className="spin" size={16} />
                  Loading products...
                </div>
              ) : null}

              {!loading && !productSearch.trim() ? (
                <div className={styles.searchEmpty}>
                  <Search size={24} />
                  <strong>Search to see products</strong>
                  <span>Type product name, SKU, brand, or model.</span>
                </div>
              ) : null}

              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className={styles.productResult}
                  onClick={() => addProduct(product)}
                  disabled={product.currentStock <= 0}
                >
                  <div className={styles.productIcon}>
                    <ShoppingCart size={17} />
                  </div>

                  <div className={styles.productInfo}>
                    <strong>{product.name}</strong>
                    <span>{product.sku}</span>
                  </div>

                  <div className={styles.productPrice}>
                    <strong>{formatRwf(product.sellingPriceRwf)}</strong>
                    <span
                      className={
                        product.currentStock > 0
                          ? styles.stockGood
                          : styles.stockBad
                      }
                    >
                      Stock {product.currentStock}
                    </span>
                  </div>

                  <span className={styles.addPill}>
                    {product.currentStock > 0 ? "Add" : "No stock"}
                  </span>
                </button>
              ))}

              {!loading &&
              productSearch.trim() &&
              filteredProducts.length === 0 ? (
                <EmptyCard
                  icon={<Search size={22} />}
                  title="No product found"
                  text="Try another product name, SKU, brand, or model."
                />
              ) : null}
            </div>
          </section>

          <section className={styles.salePanel}>
            <PanelTitle
              number="2"
              title="Current sale"
              text="Cart, customer, and payment in one clean workspace."
            />

            <div className={styles.cartArea}>
              <div className={styles.sectionLabel}>Cart</div>

              <div className={styles.cartList}>
                {cartLines.map((line) => {
                  if (!line.product) return null;

                  return (
                    <article key={line.item.rowId} className={styles.cartItem}>
                      <div className={styles.cartTop}>
                        <div>
                          <strong>{line.product.name}</strong>
                          <span>
                            Normal {formatRwf(line.normalPrice)} · Min{" "}
                            {formatRwf(line.minimumPrice)}
                          </span>
                        </div>

                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => removeCartItem(line.item.rowId)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className={styles.cartControls}>
                        <QuantityControl
                          value={line.item.quantity}
                          max={line.product.currentStock}
                          onChange={(quantity) =>
                            updateCartItem(line.item.rowId, { quantity })
                          }
                        />

                        <label className={styles.compactField}>
                          <span>Discount</span>
                          <input
                            type="number"
                            min={0}
                            value={line.item.discountRwf}
                            onChange={(event) =>
                              updateCartItem(line.item.rowId, {
                                discountRwf: Number(event.target.value || 0),
                                specialPriceRequested: false,
                              })
                            }
                          />
                        </label>

                        <div className={styles.finalPriceBox}>
                          <span>Final</span>
                          <strong>{formatRwf(line.finalUnitPrice)}</strong>
                        </div>

                        <div className={styles.finalPriceBox}>
                          <span>Total</span>
                          <strong>{formatRwf(line.lineTotal)}</strong>
                        </div>
                      </div>

                      {line.discount > 0 ? (
                        <div
                          className={
                            line.belowMinimum
                              ? styles.priceWarning
                              : styles.priceDiscount
                          }
                        >
                          <AlertTriangle size={15} />
                          <span>
                            {line.belowMinimum
                              ? "Below minimum price. Approval required."
                              : `Discount: ${formatRwf(line.discount)} per item.`}
                          </span>
                        </div>
                      ) : null}

                      {line.belowMinimum ? (
                        <div className={styles.approvalBox}>
                          <label className={styles.compactField}>
                            <span>Reason</span>
                            <input
                              value={line.item.specialPriceReason}
                              onChange={(event) =>
                                updateCartItem(line.item.rowId, {
                                  specialPriceReason: event.target.value,
                                })
                              }
                              placeholder="Why this special price?"
                            />
                          </label>

                          <button
                            type="button"
                            className={styles.approvalButton}
                            onClick={() =>
                              handleRequestSpecialPrice(line.item.rowId)
                            }
                            disabled={
                              requestingApprovalId === line.item.rowId ||
                              line.item.specialPriceRequested
                            }
                          >
                            {requestingApprovalId === line.item.rowId ? (
                              <Loader2 className="spin" size={14} />
                            ) : (
                              <WalletCards size={14} />
                            )}
                            {line.item.specialPriceRequested
                              ? "Request sent"
                              : "Request approval"}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}

                {cartLines.length === 0 ? (
                  <EmptyCard
                    icon={<ShoppingCart size={22} />}
                    title="Cart is empty"
                    text="Search a product on the left and tap Add."
                  />
                ) : null}
              </div>
            </div>

            <div className={styles.customerPaymentGrid}>
              <section className={styles.miniPanel}>
                <div className={styles.sectionLabel}>Customer</div>

                <div className={styles.optionGrid}>
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
                    text="Save"
                    selected={customerType === "new"}
                    onClick={() => chooseCustomerType("new")}
                  />
                </div>

                {customerType === "walk_in" ? (
                  <label className={styles.compactField}>
                    <span>Name</span>
                    <input
                      value={walkInName}
                      onChange={(event) => setWalkInName(event.target.value)}
                    />
                  </label>
                ) : null}

                {customerType === "existing" ? (
                  <div className={styles.customerBlock}>
                    <label className={styles.compactField}>
                      <span>Search customer</span>
                      <input
                        value={customerSearch}
                        onChange={(event) => {
                          setCustomerSearch(event.target.value);
                          setCustomerId("");
                        }}
                        placeholder="Name or phone..."
                      />
                    </label>

                    {selectedCustomer ? (
                      <div className={styles.selectedCustomer}>
                        <User size={16} />
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

                            <span>Choose</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {customerType === "new" ? (
                  <div className={styles.twoFields}>
                    <label className={styles.compactField}>
                      <span>Name</span>
                      <input
                        value={newCustomerName}
                        onChange={(event) =>
                          setNewCustomerName(event.target.value)
                        }
                        required
                      />
                    </label>

                    <label className={styles.compactField}>
                      <span>Phone</span>
                      <input
                        value={newCustomerPhone}
                        onChange={(event) =>
                          setNewCustomerPhone(event.target.value)
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </section>

              <section className={styles.miniPanel}>
                <div className={styles.sectionLabel}>Payment</div>

                <div className={styles.optionGrid}>
                  <ChoiceCard
                    title="Paid"
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
                    title="Later"
                    text="Debt"
                    selected={paymentMode === "pay_later"}
                    disabled={creditDisabledForWalkIn}
                    onClick={() => switchPaymentMode("pay_later")}
                  />

                  <ChoiceCard
                    title="Plan"
                    text="Split"
                    selected={paymentMode === "installment"}
                    disabled={creditDisabledForWalkIn}
                    onClick={() => switchPaymentMode("installment")}
                  />
                </div>

                <div className={styles.twoFields}>
                  {paymentMode === "partial" ||
                  paymentMode === "installment" ? (
                    <label className={styles.compactField}>
                      <span>Paid now</span>
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

                  <label className={styles.compactField}>
                    <span>Method</span>
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

                  {balanceRwf > 0 ? (
                    <label className={styles.compactField}>
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

                  {paymentMode === "installment" ? (
                    <>
                      <label className={styles.compactField}>
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

                      <label className={styles.compactField}>
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
                    </>
                  ) : null}
                </div>
              </section>
            </div>
          </section>

          <aside className={styles.totalPanel}>
            <TotalBox
              itemsCount={cartLines.length}
              subtotal={subtotalRwf}
              discount={totalDiscountRwf}
              total={totalAmountRwf}
              paid={finalAmountPaidRwf}
              balance={balanceRwf}
            />

            <div className={styles.totalActions}>
              <button
                type="button"
                className="staff-btn staff-btn-outline"
                onClick={resetSale}
              >
                Reset
              </button>

              <AsyncButton
                form="sales-checkout-form"
                loading={saving}
                disabled={!isCashOpen || !hasCart || hasBelowMinimum}
                type="submit"
              >
                <Plus size={15} />
                Save sale
              </AsyncButton>
            </div>
          </aside>
        </form>
      </div>
    </AppShell>
  );
}

function PanelTitle({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className={styles.panelTitle}>
      <span>{number}</span>
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
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
      className={`${styles.choiceCard} ${
        selected ? styles.choiceCardSelected : ""
      } ${disabled ? styles.choiceCardDisabled : ""}`}
      onClick={onClick}
    >
      <strong>{title}</strong>
      <span>{text}</span>
    </button>
  );
}

function QuantityControl({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className={styles.qtyControl}>
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))}>
        <Minus size={13} />
      </button>

      <strong>{value}</strong>

      <button type="button" onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus size={13} />
      </button>
    </div>
  );
}

function TotalBox({
  itemsCount,
  subtotal,
  discount,
  total,
  paid,
  balance,
}: {
  itemsCount: number;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
}) {
  return (
    <section className={styles.totalBox}>
      <div className={styles.totalHeader}>
        <span>Total</span>
        <strong>{formatRwf(total)}</strong>
      </div>

      <div className={styles.totalGrid}>
        <MiniTotal label="Items" value={String(itemsCount)} />
        <MiniTotal label="Subtotal" value={formatRwf(subtotal)} />
        <MiniTotal label="Discount" value={formatRwf(discount)} danger />
        <MiniTotal label="Paid" value={formatRwf(paid)} />
      </div>

      <div className={balance > 0 ? styles.balanceBox : styles.paidBox}>
        <span>{balance > 0 ? "Balance" : "Status"}</span>
        <strong>{balance > 0 ? formatRwf(balance) : "Fully paid"}</strong>
      </div>
    </section>
  );
}

function MiniTotal({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className={styles.miniTotal}>
      <span>{label}</span>
      <strong className={danger ? styles.orangeText : ""}>{value}</strong>
    </div>
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
