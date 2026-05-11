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
  Truck,
  X,
} from "lucide-react";
import { AuthUser, getCurrentUser, getToken } from "@/lib/auth";
import { FormEvent, useEffect, useMemo, useState } from "react";
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

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";

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

export default function InventoryPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [arrivals, setArrivals] = useState<StockArrival[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

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
      <section className="dashboard-hero">
        <div>
          <span className="hero-kicker dashboard-kicker">
            <Truck size={15} />
            New stock arrivals
          </span>

          <h1>Inventory</h1>

          <p>
            Record stock received in Kigali, track damaged items on arrival, and
            keep a clear history of every stock movement.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <button className="btn btn-outline" type="button" onClick={loadData}>
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

      <div className="premium-stats-grid">
        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <Boxes size={20} />
            </div>
            <span className="badge badge-blue">Stock</span>
          </div>
          <div className="stat-label">Total stock units</div>
          <div className="stat-value">{totalStockQuantity}</div>
          <div className="stat-help">
            Sellable stock currently in the system
          </div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <Truck size={20} />
            </div>
            <span className="badge badge-green">Received</span>
          </div>
          <div className="stat-label">Received units</div>
          <div className="stat-value">{totalArrivalsQuantity}</div>
          <div className="stat-help">All units recorded through arrivals</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <AlertTriangle size={20} />
            </div>
            <span className="badge badge-orange">Damaged</span>
          </div>
          <div className="stat-label">Damaged on arrival</div>
          <div className="stat-value">{totalDamagedOnArrival}</div>
          <div className="stat-help">
            Items received but not added to sellable stock
          </div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <CheckCircle2 size={20} />
            </div>
            <span className="badge badge-blue">Cost</span>
          </div>
          <div className="stat-label">Arrival cost</div>
          <div className="stat-value" style={{ fontSize: 24 }}>
            {formatRwf(totalArrivalCost)}
          </div>
          <div className="stat-help">
            Based on received quantity × unit cost
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

      <div className="dashboard-grid">
        <section className="table-card premium-panel">
          <div className="table-card-header">
            <div>
              <div className="table-title">Stock arrivals</div>
              <div className="app-subtitle">
                Every shipment or received stock batch is recorded here.
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
                  <th>Arrival</th>
                  <th>Items</th>
                  <th>Damaged</th>
                  <th>Cost</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>

              <tbody>
                {arrivals.map((arrival) => (
                  <tr key={arrival.id}>
                    <td>
                      <div
                        style={{ fontWeight: 900, color: "var(--gray-900)" }}
                      >
                        {arrival.shipmentReference || arrival.referenceCode}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: "var(--gray-500)",
                          fontWeight: 700,
                        }}
                      >
                        {arrival.sourceName || "Unknown source"} ·{" "}
                        {formatDate(arrival.receivedAt)}
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 11,
                          color: "var(--gray-400)",
                          fontWeight: 800,
                        }}
                      >
                        System ref: {arrival.referenceCode} · Received by{" "}
                        {arrival.receivedByName || "Unknown user"}
                      </div>
                    </td>

                    <td>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 5,
                        }}
                      >
                        <span className="badge badge-blue">
                          {arrival.itemCount} product(s)
                        </span>
                        <span className="badge badge-green">
                          {arrival.totalQuantityReceived} received
                        </span>
                      </div>
                    </td>

                    <td>
                      <span
                        className={
                          arrival.totalDamagedQuantity > 0
                            ? "badge badge-orange"
                            : "badge badge-green"
                        }
                      >
                        {arrival.totalDamagedQuantity} damaged
                      </span>
                    </td>

                    <td>
                      <div
                        style={{ fontWeight: 900, color: "var(--gray-900)" }}
                      >
                        {formatRwf(arrival.totalCostRwf)}
                      </div>
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-outline btn-sm"
                        type="button"
                        onClick={() => openArrivalDetails(arrival)}
                      >
                        <Eye size={13} />
                        View
                      </button>
                    </td>
                  </tr>
                ))}

                {arrivals.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div
                        style={{
                          padding: 24,
                          textAlign: "center",
                          color: "var(--gray-500)",
                          fontWeight: 800,
                        }}
                      >
                        No stock arrivals yet.
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="table-card premium-panel">
          <div className="table-card-header">
            <div>
              <div className="table-title">Recent stock movements</div>
              <div className="app-subtitle">
                Proof of how stock changed, who did it, and why.
              </div>
            </div>
          </div>

          <div className="attention-list">
            {movements.slice(0, 8).map((movement) => (
              <div key={movement.id} className="attention-item">
                <Package size={17} />
                <div>
                  <strong>{movement.productName}</strong>
                  <span>
                    {movement.quantityChange > 0 ? "+" : ""}
                    {movement.quantityChange} stock · {movement.quantityBefore}{" "}
                    → {movement.quantityAfter}
                  </span>
                  <span>
                    {movement.reason || movement.movementType} ·{" "}
                    {movement.actorName || "Unknown user"} ·{" "}
                    {formatDate(movement.createdAt)}
                  </span>
                </div>
              </div>
            ))}

            {movements.length === 0 ? (
              <div className="attention-item">
                <Search size={17} />
                <div>
                  <strong>No stock movement yet</strong>
                  <span>Receive stock first to create movement history.</span>
                </div>
              </div>
            ) : null}
          </div>
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
              <div className="staff-form-grid">
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

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  {items.map((item, index) => {
                    const product = products.find(
                      (productItem) => productItem.id === item.productId,
                    );

                    const quantityReceived = Number(item.quantityReceived || 0);
                    const damagedQuantity = Number(item.damagedQuantity || 0);
                    const sellableQuantity = Math.max(
                      0,
                      quantityReceived - damagedQuantity,
                    );
                    const totalCost =
                      quantityReceived * Number(item.unitCostRwf || 0);

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

                        <label
                          className="staff-form-group"
                          style={{ marginTop: 12 }}
                        >
                          <span>Item note</span>
                          <input
                            value={item.note}
                            onChange={(event) =>
                              updateItem(item.rowId, "note", event.target.value)
                            }
                            placeholder="Example: 2 pieces damaged on arrival"
                          />
                        </label>

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            marginTop: 12,
                          }}
                        >
                          <span className="badge badge-green">
                            Sellable: {sellableQuantity}
                          </span>
                          <span className="badge badge-orange">
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
                      </div>
                    );
                  })}
                </div>
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
                  <div className="staff-form-grid">
                    <div className="premium-stat-card">
                      <div className="stat-label">Source</div>
                      <div className="stat-value" style={{ fontSize: 22 }}>
                        {detailsData.arrival?.sourceName || "Unknown"}
                      </div>
                      <div className="stat-help">
                        {detailsData.arrival?.shipmentReference ||
                          "No shipment reference"}
                      </div>
                    </div>

                    <div className="premium-stat-card">
                      <div className="stat-label">Received by</div>
                      <div className="stat-value" style={{ fontSize: 22 }}>
                        {detailsData.arrival?.receivedByName || "Unknown"}
                      </div>
                      <div className="stat-help">
                        {detailsData.arrival?.receivedAt
                          ? formatDate(detailsData.arrival.receivedAt)
                          : ""}
                      </div>
                    </div>
                  </div>

                  <div className="tbl-overflow">
                    <table className="simple-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Received</th>
                          <th>Damaged</th>
                          <th>Unit cost</th>
                          <th>Total</th>
                        </tr>
                      </thead>

                      <tbody>
                        {detailsData.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div
                                style={{
                                  fontWeight: 900,
                                  color: "var(--gray-900)",
                                }}
                              >
                                {item.productName}
                              </div>
                              <div
                                style={{
                                  marginTop: 3,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: "var(--gray-500)",
                                }}
                              >
                                {item.brand || "No brand"} ·{" "}
                                {item.model || "No model"} · {item.sku}
                              </div>
                            </td>

                            <td>{item.quantityReceived}</td>
                            <td>{item.damagedQuantity}</td>
                            <td>{formatRwf(item.unitCostRwf)}</td>
                            <td>{formatRwf(item.totalCostRwf)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
