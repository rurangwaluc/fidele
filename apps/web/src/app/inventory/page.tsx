"use client";

import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Eye,
  Loader2,
  Package,
  Plus,
  History,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { AuthUser, getCurrentUser, getToken } from "@/lib/auth";
import type { FormEvent, ReactNode } from "react";
import { Product, getProducts } from "@/lib/products";
import {
  StockArrival,
  StockArrivalItem,
  createStockArrival,
  getStockArrival,
  getStockArrivals,
} from "@/lib/inventory";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import styles from "./page.module.css";

type ArrivalItemForm = {
  rowId: string;
  productId: string;
  productSearch: string;
  quantityReceived: string;
  damagedQuantity: string;
  unitCostRwf: string;
};

type DetailsModalData = {
  arrival: StockArrival | null;
  items: StockArrivalItem[];
};

function formatRwf(value: number) {
  return `Rwf ${Number(value || 0).toLocaleString("en-US")}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function hasPermission(user: AuthUser | null, permission: string) {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (user.permissions.includes("*")) return true;
  return user.permissions.includes(permission);
}

function makeRow(): ArrivalItemForm {
  return {
    rowId: crypto.randomUUID(),
    productId: "",
    productSearch: "",
    quantityReceived: "1",
    damagedQuantity: "0",
    unitCostRwf: "",
  };
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function InventoryPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [arrivals, setArrivals] = useState<StockArrival[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [stockSearch, setStockSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "needs">("all");
  const [visibleStockCount, setVisibleStockCount] = useState(14);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const [arrivalModalOpen, setArrivalModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<DetailsModalData>({
    arrival: null,
    items: [],
  });

  const [sourceName, setSourceName] = useState("");
  const [items, setItems] = useState<ArrivalItemForm[]>([makeRow()]);

  const canReceiveStock = hasPermission(user, "stock.receive");
  const canSeeCost =
    user?.role === "owner" || hasPermission(user, "products.updatePrice");

  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive),
    [products],
  );

  const stockSummary = useMemo(() => {
    return activeProducts.reduce(
      (summary, product) => {
        const quantity = Number(product.currentStock || 0);
        const lowStockAlert = Number(product.lowStockAlert || 0);
        const purchaseCost = Number(product.buyingPriceRwf || 0);

        if (quantity === 0) {
          summary.outOfStock += 1;
        } else if (quantity <= lowStockAlert) {
          summary.lowStock += 1;
        }

        summary.stockValueRwf += quantity * purchaseCost;
        return summary;
      },
      { stockValueRwf: 0, lowStock: 0, outOfStock: 0 },
    );
  }, [activeProducts]);

  const filteredProducts = useMemo(() => {
    const term = stockSearch.trim().toLowerCase();

    return activeProducts.filter((product) => {
      const needsStock =
        product.currentStock === 0 || product.currentStock <= product.lowStockAlert;

      if (stockFilter === "needs" && !needsStock) return false;
      if (!term) return true;

      return [product.name, product.categoryName, product.brand, product.model]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [activeProducts, stockFilter, stockSearch]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleStockCount),
    [filteredProducts, visibleStockCount],
  );

  const arrivalFormTotals = useMemo(() => {
    return items.reduce(
      (totals, item) => {
        if (!item.productId) return totals;

        const quantityReceived = Number(item.quantityReceived || 0);
        const damagedQuantity = Number(item.damagedQuantity || 0);
        const unitCost = Number(item.unitCostRwf || 0);
        const sellableQuantity = Math.max(
          0,
          quantityReceived - damagedQuantity,
        );

        return {
          received: totals.received + quantityReceived,
          damaged: totals.damaged + damagedQuantity,
          sellable: totals.sellable + sellableQuantity,
          cost: totals.cost + quantityReceived * unitCost,
        };
      },
      {
        received: 0,
        damaged: 0,
        sellable: 0,
        cost: 0,
      },
    );
  }, [items]);

  const selectedProductCount = useMemo(
    () => items.filter((item) => item.productId).length,
    [items],
  );

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setMessage("");

    try {
      const [meResponse, productsResponse] = await Promise.all([
        getCurrentUser(token),
        getProducts(token),
      ]);

      setUser(meResponse.user);
      setProducts(productsResponse.products);
      setVisibleStockCount(14);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load inventory.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetArrivalForm() {
    setSourceName("");
    setItems([makeRow()]);
  }

  function openArrivalModal() {
    resetArrivalForm();
    setArrivalModalOpen(true);
  }

  function closeArrivalModal() {
    setArrivalModalOpen(false);
    setSaving(false);
    resetArrivalForm();
  }

  function updateItem(
    rowId: string,
    key: keyof ArrivalItemForm,
    value: string,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.rowId === rowId
          ? {
              ...item,
              [key]: value,
            }
          : item,
      ),
    );
  }

  function updateProductSearch(rowId: string, value: string) {
    setItems((current) =>
      current.map((item) =>
        item.rowId === rowId
          ? { ...item, productSearch: value, productId: "" }
          : item,
      ),
    );
  }

  function chooseProduct(rowId: string, product: Product) {
    setItems((current) =>
      current.map((item) =>
        item.rowId === rowId
          ? { ...item, productId: product.id, productSearch: product.name }
          : item,
      ),
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

  async function handleCreateArrival(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token) return;

    const cleanItems = items.map((item) => ({
      productId: item.productId,
      quantityReceived: Number(item.quantityReceived || 0),
      damagedQuantity: Number(item.damagedQuantity || 0),
      unitCostRwf: Number(item.unitCostRwf || 0),
    }));

    const hasInvalidItem = cleanItems.some(
      (item) =>
        !item.productId ||
        item.quantityReceived < 1 ||
        item.damagedQuantity < 0 ||
        item.damagedQuantity > item.quantityReceived ||
        item.unitCostRwf < 1,
    );

    if (hasInvalidItem) {
      setMessage(
        "Choose each product and enter a valid quantity and purchase cost. Damaged quantity cannot be higher than received quantity.",
      );
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await createStockArrival(token, {
        sourceName: sourceName.trim() || undefined,
        items: cleanItems,
      });

      closeArrivalModal();
      setHistoryLoaded(false);
      await loadData();
      setMessage("Stock received successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not record stock arrival.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    if (historyLoaded) return;

    const token = getToken();
    if (!token) return;

    setHistoryLoading(true);

    try {
      const response = await getStockArrivals(token);
      setArrivals(response.arrivals);
      setHistoryLoaded(true);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load stock history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openArrivalDetails(arrival: StockArrival) {
    const token = getToken();
    if (!token) return;

    setDetailsLoading(true);
    setDetailsModalOpen(true);
    setDetailsData({
      arrival,
      items: [],
    });

    try {
      const response = await getStockArrival(token, arrival.id);

      setDetailsData({
        arrival: {
          ...arrival,
          ...response.arrival,
        },
        items: response.items,
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load arrival details.",
      );
    } finally {
      setDetailsLoading(false);
    }
  }

  return (
    <AppShell title="Stock">
      <div className={styles.inventoryPage}>
        <section className={styles.stockHeader}>
          <div>
            <h1>Stock</h1>
            <p>See what is available, what needs attention, and receive new stock.</p>
          </div>

          <div className={styles.headerActions}>
            <button className="btn btn-outline" type="button" onClick={openHistory}>
              <History size={14} />
              Stock history
            </button>

            {canReceiveStock ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={openArrivalModal}
              >
                <Plus size={14} />
                Receive stock
              </button>
            ) : null}
          </div>
        </section>

        <div className={styles.metricsGrid}>
          <MetricCard
            icon={<Boxes size={20} />}
            label="Stock value"
            value={canSeeCost ? formatRwf(stockSummary.stockValueRwf) : "-"}
            help="Current stock at purchase cost"
            badge="Current"
            badgeClass="badge badge-blue"
          />

          <MetricCard
            icon={<AlertTriangle size={20} />}
            label="Low stock"
            value={String(stockSummary.lowStock)}
            help="Products that are running low"
            badge="Attention"
            badgeClass={stockSummary.lowStock > 0 ? "badge badge-orange" : "badge badge-green"}
          />

          <MetricCard
            icon={<Package size={20} />}
            label="Out of stock"
            value={String(stockSummary.outOfStock)}
            help="Products with no units available"
            badge="Restock"
            badgeClass={stockSummary.outOfStock > 0 ? "badge badge-orange" : "badge badge-green"}
          />
        </div>

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        <section className={styles.listingPanel}>
          <div className={styles.listingTop}>
            <div>
              <h2>Current stock</h2>
              <p>Search a product and see its quantity, purchase cost, and status.</p>
            </div>

            {loading ? (
              <Loader2 className="spin" size={20} style={{ color: "var(--orange)" }} />
            ) : null}
          </div>

          <div className={styles.stockToolbar}>
            <div className={styles.searchBox}>
              <Search size={15} />
              <input
                value={stockSearch}
                onChange={(event) => {
                  setStockSearch(event.target.value);
                  setVisibleStockCount(14);
                }}
                placeholder="Search product, category, brand or model..."
              />
            </div>

            <div className={styles.filterGroup}>
              <button
                type="button"
                className={cx(styles.filterButton, stockFilter === "all" && styles.activeFilter)}
                onClick={() => {
                  setStockFilter("all");
                  setVisibleStockCount(14);
                }}
              >
                All
              </button>
              <button
                type="button"
                className={cx(styles.filterButton, stockFilter === "needs" && styles.activeFilter)}
                onClick={() => {
                  setStockFilter("needs");
                  setVisibleStockCount(14);
                }}
              >
                Needs stock
              </button>
            </div>
          </div>

          <div className={styles.responsiveList}>
            <div className={styles.stockListHeader}>
              <span>Product</span>
              <span>Stock</span>
              <span>Purchase cost</span>
              <span>Stock value</span>
              <span>Status</span>
            </div>

            {visibleProducts.map((product) => {
              const quantity = Number(product.currentStock || 0);
              const purchaseCost = product.buyingPriceRwf;
              const isOut = quantity === 0;
              const isLow = !isOut && quantity <= product.lowStockAlert;

              return (
                <article key={product.id} className={styles.stockListRow}>
                  <div className={styles.primaryCell}>
                    <div>
                      <strong>{product.name}</strong>
                      <span>{[product.categoryName, product.brand, product.model].filter(Boolean).join(" / ") || "Product"}</span>
                    </div>
                  </div>

                  <div className={styles.dataCell}><span>Stock</span><strong>{quantity}</strong></div>
                  <div className={styles.dataCell}><span>Purchase cost</span><strong>{purchaseCost == null ? "-" : formatRwf(purchaseCost)}</strong></div>
                  <div className={styles.dataCell}><span>Stock value</span><strong>{purchaseCost == null ? "-" : formatRwf(quantity * purchaseCost)}</strong></div>

                  <div className={styles.statusCell}>
                    <span>Status</span>
                    <strong className={cx(styles.stockStatus,isOut ? styles.outStatus : isLow ? styles.lowStatus : styles.inStatus)}>
                      {isOut ? "Out of stock" : isLow ? "Low stock" : "In stock"}
                    </strong>
                  </div>
                </article>
              );
            })}

            {!loading && filteredProducts.length === 0 ? (
              <EmptyCard icon={<Search size={22} />} title="No products found" text="Try another search or stock filter." />
            ) : null}
          </div>

          {filteredProducts.length > visibleStockCount ? (
            <button className={styles.loadMoreButton} type="button" onClick={() => setVisibleStockCount((current) => current + 14)}>
              Load more products
            </button>
          ) : null}
        </section>

        {historyOpen ? (
          <section className={styles.listingPanel}>
            <div className={styles.listingTop}>
              <div>
                <h2>Stock history</h2>
                <p>Open an entry only when you need to check what was received.</p>
              </div>

              <div className={styles.historyActions}>
                {historyLoading ? <Loader2 className="spin" size={18} /> : null}
                <button className="btn btn-outline btn-sm" type="button" onClick={() => setHistoryOpen(false)}>
                  Hide history
                </button>
              </div>
            </div>

            <div className={styles.responsiveList}>
              <div className={styles.historyHeader}>
                <span>Received</span><span>Qty</span><span>Damage</span><span>Cost</span><span>Action</span>
              </div>

              {arrivals.slice(0, 10).map((arrival) => (
                <article key={arrival.id} className={styles.historyRow}>
                  <div className={styles.primaryCell}>
                    <div>
                      <strong>{arrival.sourceName || "Stock received"}</strong>
                      <span>{formatShortDate(arrival.receivedAt)}</span>
                    </div>
                  </div>
                  <div className={styles.dataCell}><span>Qty</span><strong>{arrival.totalQuantityReceived}</strong></div>
                  <div className={styles.dataCell}><span>Damage</span><strong>{arrival.totalDamagedQuantity}</strong></div>
                  <div className={styles.dataCell}><span>Cost</span><strong>{formatRwf(arrival.totalCostRwf)}</strong></div>
                  <div className={styles.actionCell}>
                    <button type="button" onClick={() => openArrivalDetails(arrival)}><Eye size={14} />View</button>
                  </div>
                </article>
              ))}

              {!historyLoading && historyLoaded && arrivals.length === 0 ? (
                <EmptyCard icon={<History size={22} />} title="No stock history yet" text="Received stock will appear here." />
              ) : null}
            </div>
          </section>
        ) : null}

        {arrivalModalOpen ? (
          <div className="staff-modal-backdrop">
            <div className="staff-modal">
              <div className="staff-modal-header">
                <div>
                  <div className="staff-modal-icon">
                    <Truck size={22} />
                  </div>

                  <h2>Receive stock</h2>
                  <p>
                    Search products and record what was actually received.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeArrivalModal}
                  className="staff-modal-close"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateArrival} className="staff-modal-body">
                <label className="staff-form-group">
                  <span>Supplier / source (optional)</span>
                  <input
                    value={sourceName}
                    onChange={(event) => setSourceName(event.target.value)}
                    placeholder="Supplier or location"
                  />
                </label>

                <section>
                  <div className={styles.sectionTop}>
                    <div className="staff-form-section-title">
                      Products received
                    </div>

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
                    {items.map((item) => {
                      const product = products.find(
                        (productItem) => productItem.id === item.productId,
                      );
                      const searchTerm = item.productSearch.trim().toLowerCase();
                      const selectedElsewhere = new Set(
                        items
                          .filter((otherItem) => otherItem.rowId !== item.rowId)
                          .map((otherItem) => otherItem.productId)
                          .filter(Boolean),
                      );
                      const productMatches = searchTerm && !item.productId
                        ? activeProducts
                            .filter(
                              (productItem) => !selectedElsewhere.has(productItem.id),
                            )
                            .filter((productItem) =>
                              [
                                productItem.name,
                                productItem.categoryName,
                                productItem.brand,
                                productItem.model,
                              ]
                                .filter(Boolean)
                                .join(" ")
                                .toLowerCase()
                                .includes(searchTerm),
                            )
                            .slice(0, 6)
                        : [];

                      return (
                        <article key={item.rowId} className={styles.itemCard}>
                          {items.length > 1 ? (
                            <div className={styles.itemCardTop}>
                              <strong>{product?.name || "Product"}</strong>

                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => removeItemRow(item.rowId)}
                              >
                                <Trash2 size={13} />
                                Remove
                              </button>
                            </div>
                          ) : null}

                          <div className={styles.itemFormGrid}>
                            <div className={styles.productPicker}>
                              <label className="staff-form-group">
                                <span>Product</span>
                                <div className={styles.productSearchField}>
                                  <Search size={15} />
                                  <input
                                    value={item.productSearch}
                                    onChange={(event) =>
                                      updateProductSearch(
                                        item.rowId,
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Search product name, category or brand..."
                                    autoComplete="off"
                                  />
                                </div>
                              </label>

                              {productMatches.length > 0 ? (
                                <div className={styles.productResults}>
                                  {productMatches.map((productItem) => (
                                    <button
                                      key={productItem.id}
                                      type="button"
                                      onClick={() =>
                                        chooseProduct(item.rowId, productItem)
                                      }
                                    >
                                      <span>
                                        <strong>{productItem.name}</strong>
                                        <small>
                                          {[
                                            productItem.categoryName,
                                            productItem.brand,
                                            productItem.model,
                                          ]
                                            .filter(Boolean)
                                            .join(" / ") || "Product"}
                                        </small>
                                      </span>
                                      <em>Stock: {productItem.currentStock}</em>
                                    </button>
                                  ))}
                                </div>
                              ) : searchTerm && !item.productId ? (
                                <div className={styles.noProductResult}>
                                  No matching product
                                </div>
                              ) : null}

                              {product ? (
                                <div className={styles.selectedProduct}>
                                  <span>Selected</span>
                                  <strong>Current stock: {product.currentStock}</strong>
                                </div>
                              ) : null}
                            </div>

                            <label className="staff-form-group">
                              <span>Quantity received</span>
                              <input
                                type="number"
                                value={item.quantityReceived}
                                min={1}
                                onChange={(event) =>
                                  updateItem(
                                    item.rowId,
                                    "quantityReceived",
                                    event.target.value,
                                  )
                                }
                                required
                              />
                            </label>

                            <label className="staff-form-group">
                              <span>Damaged on arrival</span>
                              <input
                                type="number"
                                value={item.damagedQuantity}
                                min={0}
                                onChange={(event) =>
                                  updateItem(
                                    item.rowId,
                                    "damagedQuantity",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>

                            <label className="staff-form-group">
                              <span>Purchase cost / unit</span>
                              <input
                                type="number"
                                value={item.unitCostRwf}
                                min={1}
                                placeholder="Enter purchase cost"
                                onChange={(event) =>
                                  updateItem(
                                    item.rowId,
                                    "unitCostRwf",
                                    event.target.value,
                                  )
                                }
                                required
                              />
                            </label>
                          </div>

                        </article>
                      );
                    })}
                  </div>
                </section>

                <div className={styles.receiveSummary}>
                  <span>
                    {selectedProductCount} {selectedProductCount === 1 ? "product" : "products"}
                  </span>
                  <span>
                    {arrivalFormTotals.received} {arrivalFormTotals.received === 1 ? "unit" : "units"}
                  </span>
                  <strong>{formatRwf(arrivalFormTotals.cost)}</strong>
                </div>

                <div className="staff-modal-footer">
                  <button
                    type="button"
                    onClick={closeArrivalModal}
                    className="staff-btn staff-btn-outline"
                  >
                    Cancel
                  </button>

                  <AsyncButton loading={saving} type="submit">
                    <Plus size={15} />
                    Receive stock
                  </AsyncButton>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {detailsModalOpen ? (
          <div className="staff-modal-backdrop">
            <div className="staff-modal">
              <div className="staff-modal-header">
                <div>
                  <div className="staff-modal-icon">
                    <Eye size={22} />
                  </div>

                  <h2>Arrival details</h2>
                  <p>
                    {detailsData.arrival?.shipmentReference ||
                      detailsData.arrival?.referenceCode ||
                      "Loading arrival details..."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailsModalOpen(false)}
                  className="staff-modal-close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="staff-modal-body">
                {detailsLoading ? (
                  <div className="loading-card">
                    <Loader2 className="spin" size={18} />
                    <div>
                      <strong>Loading arrival...</strong>
                      <p>Checking received products.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.detailsStatsGrid}>
                      <MetricCard
                        icon={<Truck size={20} />}
                        label="Source"
                        value={detailsData.arrival?.sourceName || "Unknown"}
                        help={
                          detailsData.arrival?.shipmentReference ||
                          "No shipment reference"
                        }
                        badge="Source"
                        badgeClass="badge badge-blue"
                      />

                      <MetricCard
                        icon={<CheckCircle2 size={20} />}
                        label="Received by"
                        value={detailsData.arrival?.receivedByName || "Unknown"}
                        help={
                          detailsData.arrival?.receivedAt
                            ? formatDate(detailsData.arrival.receivedAt)
                            : "No date"
                        }
                        badge="Receiver"
                        badgeClass="badge badge-green"
                      />
                    </div>

                    <div className={styles.detailsItemList}>
                      {detailsData.items.map((item) => (
                        <article
                          key={item.id}
                          className={styles.detailItemCard}
                        >
                          <div className={styles.detailItemTop}>
                            <div className={styles.avatarIcon}>
                              <Package size={17} />
                            </div>

                            <div>
                              <h3>{item.productName}</h3>
                              <p>
                                {item.sku} · {item.brand || "No brand"} ·{" "}
                                {item.model || "No model"}
                              </p>
                            </div>
                          </div>

                          <div className={styles.miniGrid}>
                            <MiniInfo
                              label="Received"
                              value={`${item.quantityReceived} unit(s)`}
                              tone="success"
                            />
                            <MiniInfo
                              label="Damaged"
                              value={`${item.damagedQuantity} damaged`}
                              tone={
                                item.damagedQuantity > 0 ? "warning" : "success"
                              }
                            />
                            <MiniInfo
                              label="Unit cost"
                              value={formatRwf(item.unitCostRwf)}
                            />
                            <MiniInfo
                              label="Total"
                              value={formatRwf(item.totalCostRwf)}
                            />
                          </div>
                        </article>
                      ))}

                      {detailsData.items.length === 0 ? (
                        <EmptyCard
                          icon={<Package size={22} />}
                          title="No items found"
                          text="No product item was returned for this stock arrival."
                        />
                      ) : null}
                    </div>
                  </>
                )}
              </div>
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
