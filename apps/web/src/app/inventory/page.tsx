"use client";

import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Eye,
  Loader2,
  Package,
  Plus,
  RefreshCw,
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
  StockMovement,
  createStockArrival,
  getNextShipmentReference,
  getStockArrival,
  getStockArrivals,
  getStockMovements,
} from "@/lib/inventory";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import styles from "./page.module.css";

type ArrivalItemForm = {
  rowId: string;
  productId: string;
  quantityReceived: string;
  damagedQuantity: string;
  unitCostRwf: string;
  note: string;
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
    quantityReceived: "1",
    damagedQuantity: "0",
    unitCostRwf: "0",
    note: "",
  };
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function InventoryPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [arrivals, setArrivals] = useState<StockArrival[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [listSearch, setListSearch] = useState("");
  const [visibleArrivalsCount, setVisibleArrivalsCount] = useState(8);
  const [visibleMovementsCount, setVisibleMovementsCount] = useState(8);

  const [arrivalModalOpen, setArrivalModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<DetailsModalData>({
    arrival: null,
    items: [],
  });

  const [sourceName, setSourceName] = useState("Dubai shipment");
  const [shipmentReference, setShipmentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ArrivalItemForm[]>([makeRow()]);

  const canReceiveStock = hasPermission(user, "stock.receive");

  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive),
    [products],
  );

  const totalStockQuantity = useMemo(
    () =>
      products.reduce(
        (sum, product) => sum + Number(product.currentStock || 0),
        0,
      ),
    [products],
  );

  const totalArrivalsQuantity = useMemo(
    () =>
      arrivals.reduce(
        (sum, arrival) => sum + Number(arrival.totalQuantityReceived || 0),
        0,
      ),
    [arrivals],
  );

  const totalDamagedOnArrival = useMemo(
    () =>
      arrivals.reduce(
        (sum, arrival) => sum + Number(arrival.totalDamagedQuantity || 0),
        0,
      ),
    [arrivals],
  );

  const totalArrivalCost = useMemo(
    () =>
      arrivals.reduce(
        (sum, arrival) => sum + Number(arrival.totalCostRwf || 0),
        0,
      ),
    [arrivals],
  );

  const filteredArrivals = useMemo(() => {
    const term = listSearch.trim().toLowerCase();

    if (!term) return arrivals;

    return arrivals.filter((arrival) => {
      const shipmentReferenceValue = (
        arrival.shipmentReference || ""
      ).toLowerCase();
      const referenceCode = (arrival.referenceCode || "").toLowerCase();
      const source = (arrival.sourceName || "").toLowerCase();
      const receivedBy = (arrival.receivedByName || "").toLowerCase();

      return (
        shipmentReferenceValue.includes(term) ||
        referenceCode.includes(term) ||
        source.includes(term) ||
        receivedBy.includes(term)
      );
    });
  }, [arrivals, listSearch]);

  const filteredMovements = useMemo(() => {
    const term = listSearch.trim().toLowerCase();

    if (!term) return movements;

    return movements.filter((movement) => {
      const productName = (movement.productName || "").toLowerCase();
      const reason = (movement.reason || "").toLowerCase();
      const movementType = (movement.movementType || "").toLowerCase();
      const actorName = (movement.actorName || "").toLowerCase();

      return (
        productName.includes(term) ||
        reason.includes(term) ||
        movementType.includes(term) ||
        actorName.includes(term)
      );
    });
  }, [listSearch, movements]);

  const visibleArrivals = useMemo(
    () => filteredArrivals.slice(0, visibleArrivalsCount),
    [filteredArrivals, visibleArrivalsCount],
  );

  const visibleMovements = useMemo(
    () => filteredMovements.slice(0, visibleMovementsCount),
    [filteredMovements, visibleMovementsCount],
  );

  const hasMoreArrivals = visibleArrivalsCount < filteredArrivals.length;
  const hasMoreMovements = visibleMovementsCount < filteredMovements.length;

  const arrivalFormTotals = useMemo(() => {
    return items.reduce(
      (totals, item) => {
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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setMessage("");

    try {
      const [
        meResponse,
        productsResponse,
        arrivalsResponse,
        movementsResponse,
      ] = await Promise.all([
        getCurrentUser(token),
        getProducts(token),
        getStockArrivals(token),
        getStockMovements(token),
      ]);

      setUser(meResponse.user);
      setProducts(productsResponse.products);
      setArrivals(arrivalsResponse.arrivals);
      setMovements(movementsResponse.movements);
      setVisibleArrivalsCount(8);
      setVisibleMovementsCount(8);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load inventory.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetArrivalForm() {
    setSourceName("Dubai shipment");
    setShipmentReference("");
    setNotes("");
    setItems([makeRow()]);
  }

  async function openArrivalModal() {
    const token = getToken();

    resetArrivalForm();
    setArrivalModalOpen(true);

    if (!token) return;

    try {
      const response = await getNextShipmentReference(token);
      setShipmentReference(response.shipmentReference);
    } catch {
      setShipmentReference("");
    }
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
      note: item.note,
    }));

    const hasInvalidItem = cleanItems.some(
      (item) =>
        !item.productId ||
        item.quantityReceived < 1 ||
        item.damagedQuantity < 0 ||
        item.damagedQuantity > item.quantityReceived,
    );

    if (hasInvalidItem) {
      setMessage(
        "Please check arrival items. Damaged quantity cannot be higher than received quantity.",
      );
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await createStockArrival(token, {
        sourceName,
        shipmentReference,
        notes,
        items: cleanItems,
      });

      closeArrivalModal();
      await loadData();
      setMessage("Stock arrival recorded successfully.");
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
        <section className={`dashboard-hero ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className="hero-kicker dashboard-kicker">
              <Truck size={15} />
              New stock arrivals
            </span>

            <h1>Inventory</h1>

            <p>
              Record stock received in Kigali, track damaged items on arrival,
              and keep a clear history of every stock movement.
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
            label="Total stock units"
            value={String(totalStockQuantity)}
            help="Sellable stock currently in the system"
            badge="Stock"
            badgeClass="badge badge-blue"
          />

          <MetricCard
            icon={<Truck size={20} />}
            label="Received units"
            value={String(totalArrivalsQuantity)}
            help="All units recorded through arrivals"
            badge="Received"
            badgeClass="badge badge-green"
          />

          <MetricCard
            icon={<AlertTriangle size={20} />}
            label="Damaged on arrival"
            value={String(totalDamagedOnArrival)}
            help="Items received but not added to sellable stock"
            badge="Damaged"
            badgeClass="badge badge-orange"
          />

          <MetricCard
            icon={<CheckCircle2 size={20} />}
            label="Arrival cost"
            value={formatRwf(totalArrivalCost)}
            help="Based on received quantity × unit cost"
            badge="Cost"
            badgeClass="badge badge-blue"
          />
        </div>

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        <section className={`table-card premium-panel ${styles.controlPanel}`}>
          <div className="table-card-header">
            <div>
              <div className="table-title">Inventory control</div>
              <div className="app-subtitle">
                Search stock arrivals and stock movements without horizontal
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
                value={listSearch}
                onChange={(event) => {
                  setListSearch(event.target.value);
                  setVisibleArrivalsCount(8);
                  setVisibleMovementsCount(8);
                }}
                placeholder="Search shipment, product, source, user..."
              />
            </div>

            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                setListSearch("");
                setVisibleArrivalsCount(8);
                setVisibleMovementsCount(8);
              }}
            >
              Clear
            </button>
          </div>
        </section>

        <div className={styles.mainGrid}>
          <section className={`table-card premium-panel ${styles.listPanel}`}>
            <div className="table-card-header">
              <div>
                <div className="table-title">Stock arrivals</div>
                <div className="app-subtitle">
                  Every shipment or received stock batch is recorded here.
                </div>
              </div>

              <span className="badge badge-blue">
                {filteredArrivals.length} record(s)
              </span>
            </div>

            <div className={styles.arrivalList}>
              {visibleArrivals.map((arrival) => (
                <article key={arrival.id} className={styles.arrivalCard}>
                  <div className={styles.arrivalTop}>
                    <div className={styles.arrivalIdentity}>
                      <div className={styles.cardIcon}>
                        <Truck size={18} />
                      </div>

                      <div>
                        <h3>
                          {arrival.shipmentReference || arrival.referenceCode}
                        </h3>
                        <p>
                          {arrival.sourceName || "Unknown source"} ·{" "}
                          {formatDate(arrival.receivedAt)}
                        </p>
                        <span>
                          System ref: {arrival.referenceCode} · Received by{" "}
                          {arrival.receivedByName || "Unknown user"}
                        </span>
                      </div>
                    </div>

                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => openArrivalDetails(arrival)}
                    >
                      <Eye size={13} />
                      View
                    </button>
                  </div>

                  <div className={styles.miniGrid}>
                    <MiniInfo
                      label="Products"
                      value={`${arrival.itemCount} product(s)`}
                    />

                    <MiniInfo
                      label="Received"
                      value={`${arrival.totalQuantityReceived} unit(s)`}
                      tone="success"
                    />

                    <MiniInfo
                      label="Damaged"
                      value={`${arrival.totalDamagedQuantity} damaged`}
                      tone={
                        arrival.totalDamagedQuantity > 0 ? "warning" : "success"
                      }
                    />

                    <MiniInfo
                      label="Cost"
                      value={formatRwf(arrival.totalCostRwf)}
                    />
                  </div>
                </article>
              ))}

              {filteredArrivals.length === 0 ? (
                <EmptyCard
                  icon={<Truck size={19} />}
                  title="No stock arrivals found"
                  text="Receive stock first or try another search term."
                />
              ) : null}
            </div>

            {hasMoreArrivals ? (
              <div className={styles.loadMoreBox}>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() =>
                    setVisibleArrivalsCount((current) => current + 8)
                  }
                >
                  Load more arrivals
                </button>
              </div>
            ) : null}
          </section>

          <section className={`table-card premium-panel ${styles.listPanel}`}>
            <div className="table-card-header">
              <div>
                <div className="table-title">Recent stock movements</div>
                <div className="app-subtitle">
                  Proof of how stock changed, who did it, and why.
                </div>
              </div>

              <span className="badge badge-blue">
                {filteredMovements.length} record(s)
              </span>
            </div>

            <div className={styles.movementList}>
              {visibleMovements.map((movement) => (
                <article key={movement.id} className={styles.movementCard}>
                  <div className={styles.movementTop}>
                    <div className={styles.cardIcon}>
                      <Package size={17} />
                    </div>

                    <div>
                      <h3>{movement.productName}</h3>
                      <p>
                        {movement.quantityChange > 0 ? "+" : ""}
                        {movement.quantityChange} stock ·{" "}
                        {movement.quantityBefore} → {movement.quantityAfter}
                      </p>
                      <span>
                        {movement.reason || movement.movementType} ·{" "}
                        {movement.actorName || "Unknown user"} ·{" "}
                        {formatDate(movement.createdAt)}
                      </span>
                    </div>
                  </div>
                </article>
              ))}

              {filteredMovements.length === 0 ? (
                <EmptyCard
                  icon={<Search size={19} />}
                  title="No stock movement found"
                  text="Receive stock first or try another search term."
                />
              ) : null}
            </div>

            {hasMoreMovements ? (
              <div className={styles.loadMoreBox}>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() =>
                    setVisibleMovementsCount((current) => current + 8)
                  }
                >
                  Load more movements
                </button>
              </div>
            ) : null}
          </section>
        </div>

        {arrivalModalOpen ? (
          <div className="staff-modal-backdrop">
            <div className="staff-modal">
              <div className="staff-modal-header">
                <div>
                  <div className="staff-modal-icon">
                    <Truck size={22} />
                  </div>

                  <h2>Receive new stock</h2>
                  <p>
                    Add products received in Kigali. Only sellable quantity
                    increases stock.
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
                <div className={styles.modalGrid}>
                  <label className="staff-form-group">
                    <span>Source</span>
                    <input
                      value={sourceName}
                      onChange={(event) => setSourceName(event.target.value)}
                      placeholder="Example: Dubai shipment"
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Shipment reference</span>
                    <input
                      value={shipmentReference}
                      readOnly
                      placeholder="Auto-generated"
                    />
                  </label>
                </div>

                <label className="staff-form-group">
                  <span>Notes</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Example: Items received from Dubai by trusted employee."
                  />
                </label>

                <section className={styles.arrivalSummaryBox}>
                  <div className={styles.summaryHeader}>
                    <div>
                      <div className="staff-form-section-title">
                        Arrival summary
                      </div>
                      <p>Check received, damaged, sellable, and total cost.</p>
                    </div>

                    <span className="badge badge-blue">
                      {items.length} item row(s)
                    </span>
                  </div>

                  <div className={styles.miniGrid}>
                    <MiniInfo
                      label="Received"
                      value={`${arrivalFormTotals.received} unit(s)`}
                      tone="success"
                    />
                    <MiniInfo
                      label="Sellable"
                      value={`${arrivalFormTotals.sellable} unit(s)`}
                      tone="success"
                    />
                    <MiniInfo
                      label="Damaged"
                      value={`${arrivalFormTotals.damaged} damaged`}
                      tone={
                        arrivalFormTotals.damaged > 0 ? "warning" : "success"
                      }
                    />
                    <MiniInfo
                      label="Cost"
                      value={formatRwf(arrivalFormTotals.cost)}
                    />
                  </div>
                </section>

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
                    {items.map((item, index) => {
                      const product = products.find(
                        (productItem) => productItem.id === item.productId,
                      );

                      const quantityReceived = Number(
                        item.quantityReceived || 0,
                      );
                      const damagedQuantity = Number(item.damagedQuantity || 0);
                      const sellableQuantity = Math.max(
                        0,
                        quantityReceived - damagedQuantity,
                      );
                      const totalCost =
                        quantityReceived * Number(item.unitCostRwf || 0);

                      return (
                        <article key={item.rowId} className={styles.itemCard}>
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

                          <div className={styles.itemFormGrid}>
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
                                  >
                                    {productItem.name} · {productItem.sku} ·
                                    Stock: {productItem.currentStock}
                                  </option>
                                ))}
                              </select>
                            </label>

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
                              <span>Damaged quantity</span>
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
                              <span>Unit cost</span>
                              <input
                                type="number"
                                value={item.unitCostRwf}
                                min={0}
                                onChange={(event) =>
                                  updateItem(
                                    item.rowId,
                                    "unitCostRwf",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                          </div>

                          <label className="staff-form-group">
                            <span>Item note</span>
                            <input
                              value={item.note}
                              onChange={(event) =>
                                updateItem(
                                  item.rowId,
                                  "note",
                                  event.target.value,
                                )
                              }
                              placeholder="Example: 2 pieces damaged on arrival"
                            />
                          </label>

                          <div className={styles.badgeRow}>
                            <span className="badge badge-green">
                              Sellable: {sellableQuantity}
                            </span>
                            <span
                              className={
                                damagedQuantity > 0
                                  ? "badge badge-orange"
                                  : "badge badge-green"
                              }
                            >
                              Damaged: {damagedQuantity}
                            </span>
                            <span className="badge badge-blue">
                              Cost: {formatRwf(totalCost)}
                            </span>
                            {product ? (
                              <span className="badge badge-blue">
                                Current stock: {product.currentStock}
                              </span>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>

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
                    Save stock arrival
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
                            <div className={styles.cardIcon}>
                              <Package size={17} />
                            </div>

                            <div>
                              <h3>{item.productName}</h3>
                              <p>
                                {item.brand || "No brand"} ·{" "}
                                {item.model || "No model"} · {item.sku}
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
                          icon={<Package size={19} />}
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
