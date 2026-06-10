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
      return (
        (arrival.shipmentReference || "").toLowerCase().includes(term) ||
        (arrival.referenceCode || "").toLowerCase().includes(term) ||
        (arrival.sourceName || "").toLowerCase().includes(term) ||
        (arrival.receivedByName || "").toLowerCase().includes(term)
      );
    });
  }, [arrivals, listSearch]);

  const filteredMovements = useMemo(() => {
    const term = listSearch.trim().toLowerCase();

    if (!term) return movements;

    return movements.filter((movement) => {
      return (
        (movement.productName || "").toLowerCase().includes(term) ||
        (movement.reason || "").toLowerCase().includes(term) ||
        (movement.movementType || "").toLowerCase().includes(term) ||
        (movement.actorName || "").toLowerCase().includes(term)
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
        "Please check received products. Damaged quantity cannot be higher than received quantity.",
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

  const latestArrival = arrivals[0];
  const latestMovement = movements[0];

  return (
    <AppShell title="Stock">
      <div className={styles.inventoryPage}>
        <section className={styles.ownerHero}>
          <div>
            <span className={styles.kicker}>
              <Truck size={15} />
              Inventory
            </span>

            <h1>Stock Control</h1>

            <p>
              Receive stock, check damaged items, and see the latest stock
              changes without confusion.
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

        <section className={styles.actionCard}>
          <div className={styles.actionIcon}>
            {totalDamagedOnArrival > 0 ? (
              <AlertTriangle size={22} />
            ) : (
              <CheckCircle2 size={22} />
            )}
          </div>

          <div>
            <strong>
              {totalDamagedOnArrival > 0
                ? "Check damaged stock before selling."
                : "Stock records look clean."}
            </strong>
            <span>
              {latestArrival
                ? `Latest arrival: ${
                    latestArrival.shipmentReference ||
                    latestArrival.referenceCode
                  } from ${latestArrival.sourceName || "unknown source"}.`
                : "No stock arrival has been recorded yet."}
            </span>
          </div>
        </section>

        <div className={styles.metricsGrid}>
          <MetricCard
            icon={<Boxes size={20} />}
            label="Stock available"
            value={String(totalStockQuantity)}
            help="Sellable units currently in the shop"
            badge="Now"
            badgeClass="badge badge-blue"
          />

          <MetricCard
            icon={<Truck size={20} />}
            label="Arrivals"
            value={String(arrivals.length)}
            help="Stock batches received"
            badge="Batches"
            badgeClass="badge badge-green"
          />

          <MetricCard
            icon={<AlertTriangle size={20} />}
            label="Damaged"
            value={String(totalDamagedOnArrival)}
            help="Items received damaged"
            badge="Check"
            badgeClass={
              totalDamagedOnArrival > 0
                ? "badge badge-orange"
                : "badge badge-green"
            }
          />

          <MetricCard
            icon={<CheckCircle2 size={20} />}
            label="Stock value"
            value={formatRwf(totalArrivalCost)}
            help="Recorded value of received stock"
            badge="Value"
            badgeClass="badge badge-blue"
          />
        </div>

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        <section className={styles.listingPanel}>
          <div className={styles.listingTop}>
            <div>
              <h2>Stock arrivals</h2>
              <p>
                Only the important proof: shipment, source, quantity, damage,
                cost, and action.
              </p>
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
            <div className={styles.searchBox}>
              <Search size={15} />
              <input
                value={listSearch}
                onChange={(event) => {
                  setListSearch(event.target.value);
                  setVisibleArrivalsCount(8);
                  setVisibleMovementsCount(8);
                }}
                placeholder="Search shipment, source, user..."
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

          <div className={styles.responsiveList}>
            <div className={styles.listHeader}>
              <span>Shipment</span>
              <span>Qty</span>
              <span>Damage</span>
              <span>Cost</span>
              <span>Action</span>
            </div>

            {visibleArrivals.map((arrival) => {
              const damaged = Number(arrival.totalDamagedQuantity || 0);

              return (
                <article key={arrival.id} className={styles.listRow}>
                  <div className={styles.primaryCell}>
                    <div className={styles.avatarIcon}>
                      <Truck size={17} />
                    </div>

                    <div>
                      <strong>
                        {arrival.shipmentReference || arrival.referenceCode}
                      </strong>
                      <span>
                        {arrival.sourceName || "Unknown source"} ·{" "}
                        {formatShortDate(arrival.receivedAt)}
                      </span>
                    </div>
                  </div>

                  <div className={styles.dataCell}>
                    <span>Qty</span>
                    <strong>{arrival.totalQuantityReceived}</strong>
                  </div>

                  <div className={styles.dataCell}>
                    <span>Damage</span>
                    <strong>{damaged}</strong>
                  </div>

                  <div className={styles.dataCell}>
                    <span>Cost</span>
                    <strong>{formatRwf(arrival.totalCostRwf)}</strong>
                  </div>

                  <div className={styles.actionCell}>
                    <button
                      type="button"
                      onClick={() => openArrivalDetails(arrival)}
                    >
                      <Eye size={14} />
                      View
                    </button>
                  </div>
                </article>
              );
            })}

            {filteredArrivals.length === 0 ? (
              <EmptyCard
                icon={<Truck size={22} />}
                title="No stock arrivals found"
                text="Receive stock first or search another shipment/source."
              />
            ) : null}
          </div>

          {filteredArrivals.length > visibleArrivalsCount ? (
            <button
              className={styles.loadMoreButton}
              type="button"
              onClick={() => setVisibleArrivalsCount((current) => current + 8)}
            >
              Load more arrivals
            </button>
          ) : null}
        </section>

        <section className={styles.listingPanel}>
          <div className={styles.listingTop}>
            <div>
              <h2>Latest stock changes</h2>
              <p>
                Simple audit trail: product, stock change, reason, and user.
              </p>
            </div>

            <span className="badge badge-blue">
              {filteredMovements.length} record(s)
            </span>
          </div>

          <div className={styles.responsiveList}>
            <div className={styles.movementHeader}>
              <span>Product</span>
              <span>Change</span>
              <span>Before → After</span>
              <span>Reason</span>
            </div>

            {visibleMovements.map((movement) => (
              <article key={movement.id} className={styles.movementRow}>
                <div className={styles.primaryCell}>
                  <div className={styles.avatarIcon}>
                    <Package size={17} />
                  </div>

                  <div>
                    <strong>{movement.productName}</strong>
                    <span>
                      {movement.actorName || "Unknown user"} ·{" "}
                      {formatShortDate(movement.createdAt)}
                    </span>
                  </div>
                </div>

                <div className={styles.dataCell}>
                  <span>Change</span>
                  <strong
                    className={
                      movement.quantityChange >= 0
                        ? styles.positiveValue
                        : styles.negativeValue
                    }
                  >
                    {movement.quantityChange > 0 ? "+" : ""}
                    {movement.quantityChange}
                  </strong>
                </div>

                <div className={styles.dataCell}>
                  <span>Before → After</span>
                  <strong>
                    {movement.quantityBefore} → {movement.quantityAfter}
                  </strong>
                </div>

                <div className={styles.reasonCell}>
                  <span>Reason</span>
                  <strong>{movement.reason || movement.movementType}</strong>
                </div>
              </article>
            ))}

            {filteredMovements.length === 0 ? (
              <EmptyCard
                icon={<Search size={22} />}
                title="No stock movement found"
                text="Stock changes will appear here after receiving or adjusting stock."
              />
            ) : null}
          </div>

          {filteredMovements.length > visibleMovementsCount ? (
            <button
              className={styles.loadMoreButton}
              type="button"
              onClick={() => setVisibleMovementsCount((current) => current + 8)}
            >
              Load more movements
            </button>
          ) : null}

          {latestMovement ? (
            <div className={styles.mobileHint}>
              Latest: {latestMovement.productName} changed by{" "}
              {latestMovement.quantityChange > 0 ? "+" : ""}
              {latestMovement.quantityChange}.
            </div>
          ) : null}
        </section>

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
                    Add products received. Damaged items are recorded
                    separately.
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
                    placeholder="Example: Items received by trusted employee."
                  />
                </label>

                <section className={styles.arrivalSummaryBox}>
                  <div className={styles.summaryHeader}>
                    <div>
                      <div className="staff-form-section-title">
                        Arrival summary
                      </div>
                      <p>Confirm received, sellable, damaged, and cost.</p>
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
                    Save stock
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
