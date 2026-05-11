"use client";

import {
  AlertTriangle,
  BadgeDollarSign,
  Boxes,
  CheckCircle2,
  Loader2,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { AuthUser, getCurrentUser, getToken } from "@/lib/auth";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Product,
  ProductCategory,
  activateProduct,
  createProduct,
  deactivateProduct,
  getProductCategories,
  getProducts,
  updateProductDetails,
  updateProductPrices,
} from "@/lib/products";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";

type ProductModalMode = "create" | "edit" | "price" | null;

type ActionMenuState = {
  productId: string;
  x: number;
  y: number;
  direction: "down" | "up";
};

function formatRwf(value: number) {
  return `Rwf ${Number(value || 0).toLocaleString("en-US")}`;
}

function hasPermission(user: AuthUser | null, permission: string) {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (user.permissions.includes("*")) return true;
  return user.permissions.includes(permission);
}

export default function ProductsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalMode, setModalMode] = useState<ProductModalMode>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [description, setDescription] = useState("");
  const [buyingPriceRwf, setBuyingPriceRwf] = useState("0");
  const [sellingPriceRwf, setSellingPriceRwf] = useState("0");
  const [minSellingPriceRwf, setMinSellingPriceRwf] = useState("0");
  const [lowStockAlert, setLowStockAlert] = useState("1");
  const [warrantyText, setWarrantyText] = useState("");
  const [priceReason, setPriceReason] = useState("");

  const canCreate = hasPermission(user, "products.create");
  const canEdit = hasPermission(user, "products.update");
  const canUpdatePrice = hasPermission(user, "products.updatePrice");
  const canSeeBuyingPrice = user?.role === "owner" || canUpdatePrice;

  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive),
    [products],
  );

  const inactiveProducts = useMemo(
    () => products.filter((product) => !product.isActive),
    [products],
  );

  const totalStockUnits = useMemo(
    () =>
      products.reduce(
        (sum, product) => sum + Number(product.currentStock || 0),
        0,
      ),
    [products],
  );

  const lowStockProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.isActive && product.currentStock <= product.lowStockAlert,
      ),
    [products],
  );

  useEffect(() => {
    loadData("");
  }, []);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        loadData(search);
      }
    }

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [search]);

  useEffect(() => {
    if (!actionMenu) return;

    function closeMenu() {
      setActionMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [actionMenu]);

  async function loadData(nextSearch = search) {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setMessage("");

    try {
      const [meResponse, productsResponse, categoriesResponse] =
        await Promise.all([
          getCurrentUser(token),
          getProducts(token, nextSearch),
          getProductCategories(token),
        ]);

      setUser(meResponse.user);
      setProducts(productsResponse.products);
      setCategories(categoriesResponse.categories);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load products.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName("");
    setSku("");
    setCategoryName("");
    setBrand("");
    setModel("");
    setDescription("");
    setBuyingPriceRwf("0");
    setSellingPriceRwf("0");
    setMinSellingPriceRwf("0");
    setLowStockAlert("1");
    setWarrantyText("");
    setPriceReason("");
  }

  function openCreateModal() {
    resetForm();
    setSelectedProduct(null);
    setActionMenu(null);
    setModalMode("create");
  }

  function openEditModal(product: Product) {
    setSelectedProduct(product);
    setName(product.name);
    setSku(product.sku);
    setCategoryName(product.categoryName || "");
    setBrand(product.brand || "");
    setModel(product.model || "");
    setDescription(product.description || "");
    setLowStockAlert(String(product.lowStockAlert));
    setWarrantyText(product.warrantyText || "");
    setActionMenu(null);
    setModalMode("edit");
  }

  function openPriceModal(product: Product) {
    setSelectedProduct(product);
    setBuyingPriceRwf(String(product.buyingPriceRwf));
    setSellingPriceRwf(String(product.sellingPriceRwf));
    setMinSellingPriceRwf(String(product.minSellingPriceRwf));
    setPriceReason("Price update");
    setActionMenu(null);
    setModalMode("price");
  }

  function closeModal() {
    setModalMode(null);
    setSelectedProduct(null);
    setSaving(false);
    resetForm();
  }

  function toggleActionMenu(
    event: React.MouseEvent<HTMLButtonElement>,
    product: Product,
  ) {
    event.stopPropagation();

    if (actionMenu?.productId === product.id) {
      setActionMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 215;
    const menuHeight = 190;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const direction: "down" | "up" =
      spaceBelow < menuHeight && spaceAbove > spaceBelow ? "up" : "down";

    setActionMenu({
      productId: product.id,
      direction,
      x: Math.max(
        12,
        Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12),
      ),
      y: direction === "down" ? rect.bottom + 8 : rect.top - 8,
    });
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadData(search);
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token) return;

    setSaving(true);
    setMessage("");

    try {
      await createProduct(token, {
        name,
        sku: sku || undefined,
        categoryName,
        brand,
        model,
        description,
        buyingPriceRwf: Number(buyingPriceRwf || 0),
        sellingPriceRwf: Number(sellingPriceRwf || 0),
        minSellingPriceRwf: Number(minSellingPriceRwf || 0),
        lowStockAlert: Number(lowStockAlert || 1),
        warrantyText,
      });

      closeModal();
      setSearch("");
      await loadData("");
      setMessage("Product created successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create product.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token || !selectedProduct) return;

    setSaving(true);
    setMessage("");

    try {
      await updateProductDetails(token, selectedProduct.id, {
        name,
        categoryName,
        brand,
        model,
        description,
        lowStockAlert: Number(lowStockAlert || 1),
        warrantyText,
      });

      closeModal();
      await loadData(search);
      setMessage("Product details updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update product.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdatePrices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token || !selectedProduct) return;

    setSaving(true);
    setMessage("");

    try {
      await updateProductPrices(token, selectedProduct.id, {
        buyingPriceRwf: Number(buyingPriceRwf || 0),
        sellingPriceRwf: Number(sellingPriceRwf || 0),
        minSellingPriceRwf: Number(minSellingPriceRwf || 0),
        reason: priceReason,
      });

      closeModal();
      await loadData(search);
      setMessage("Product prices updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update prices.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(product: Product) {
    const token = getToken();
    if (!token) return;

    setActionMenu(null);
    setMessage("");

    try {
      await deactivateProduct(token, product.id);
      await loadData(search);
      setMessage("Product deactivated.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not deactivate product.",
      );
    }
  }

  async function handleActivate(product: Product) {
    const token = getToken();
    if (!token) return;

    setActionMenu(null);
    setMessage("");

    try {
      await activateProduct(token, product.id);
      await loadData(search);
      setMessage("Product activated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not activate product.",
      );
    }
  }

  const menuProduct = actionMenu
    ? products.find((product) => product.id === actionMenu.productId)
    : null;

  const modalTitle =
    modalMode === "create"
      ? "Create product"
      : modalMode === "edit"
        ? "Edit product"
        : modalMode === "price"
          ? "Update prices"
          : "";

  const modalDescription =
    modalMode === "create"
      ? "Create the product profile. Stock quantity will stay 0 until stock is received."
      : modalMode === "edit"
        ? "Update product details without changing stock."
        : modalMode === "price"
          ? "Update buying, selling, and minimum prices."
          : "";

  return (
    <AppShell title="Products">
      <section className="dashboard-hero">
        <div>
          <span className="hero-kicker dashboard-kicker">
            <Package size={15} />
            Product profiles
          </span>

          <h1>Products</h1>

          <p>
            Create and manage product profiles. Product creation does not
            increase stock. Current stock comes from New Stock Arrivals.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => loadData(search)}
          >
            <RefreshCw size={14} />
            Refresh
          </button>

          {canCreate ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={openCreateModal}
            >
              <Plus size={14} />
              Create product
            </button>
          ) : null}
        </div>
      </section>

      <div className="premium-stats-grid">
        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <Package size={20} />
            </div>
            <span className="badge badge-blue">Total</span>
          </div>
          <div className="stat-label">Products</div>
          <div className="stat-value">{products.length}</div>
          <div className="stat-help">All product profiles in the shop</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <Boxes size={20} />
            </div>
            <span className="badge badge-green">Stock</span>
          </div>
          <div className="stat-label">Total stock units</div>
          <div className="stat-value">{totalStockUnits}</div>
          <div className="stat-help">Sellable stock from received arrivals</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <AlertTriangle size={20} />
            </div>
            <span className="badge badge-orange">Low stock</span>
          </div>
          <div className="stat-label">Low stock alerts</div>
          <div className="stat-value">{lowStockProducts.length}</div>
          <div className="stat-help">Products at or below alert quantity</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <PowerOff size={20} />
            </div>
            <span className="badge badge-orange">Inactive</span>
          </div>
          <div className="stat-label">Inactive products</div>
          <div className="stat-value">{inactiveProducts.length}</div>
          <div className="stat-help">Products hidden from normal selling</div>
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

      <section className="table-card premium-panel">
        <div className="table-card-header">
          <div>
            <div className="table-title">Product list</div>
            <div className="app-subtitle">
              Search, create, edit, update prices, activate, and deactivate
              products.
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

        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <form
            onSubmit={handleSearch}
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div className="hdr-search" style={{ flex: "1 1 260px" }}>
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search product name, SKU, brand, model..."
              />
            </div>

            <button className="btn btn-outline" type="submit">
              <Search size={14} />
              Search
            </button>

            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                setSearch("");
                loadData("");
              }}
            >
              Clear
            </button>
          </form>
        </div>

        <div className="tbl-overflow">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Current stock</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <div
                        className="feature-icon"
                        style={{
                          marginBottom: 0,
                          width: 42,
                          height: 42,
                          borderRadius: 12,
                        }}
                      >
                        <Package size={19} />
                      </div>

                      <div>
                        <div
                          style={{ fontWeight: 900, color: "var(--gray-900)" }}
                        >
                          {product.name}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--gray-500)",
                            fontWeight: 700,
                            marginTop: 3,
                          }}
                        >
                          {product.brand || "No brand"} ·{" "}
                          {product.model || "No model"}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--gray-400)",
                            fontWeight: 800,
                            marginTop: 3,
                          }}
                        >
                          SKU: {product.sku}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span className="badge badge-blue">
                      {product.categoryName || "Uncategorized"}
                    </span>
                  </td>

                  <td>
                    <div style={{ fontWeight: 900, color: "var(--gray-900)" }}>
                      {formatRwf(product.sellingPriceRwf)}
                    </div>

                    {canSeeBuyingPrice ? (
                      <div
                        style={{
                          marginTop: 4,
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                          fontSize: 11,
                          color: "var(--gray-400)",
                          fontWeight: 800,
                        }}
                      >
                        <span>Buying: {formatRwf(product.buyingPriceRwf)}</span>
                        <span>
                          Minimum: {formatRwf(product.minSellingPriceRwf)}
                        </span>
                      </div>
                    ) : null}
                  </td>

                  <td>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                      }}
                    >
                      <span
                        className={
                          product.currentStock <= product.lowStockAlert
                            ? "badge badge-orange"
                            : "badge badge-green"
                        }
                      >
                        <Boxes size={12} />
                        {product.currentStock} in stock
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--gray-400)",
                          fontWeight: 800,
                        }}
                      >
                        Alert at {product.lowStockAlert}
                      </span>
                    </div>
                  </td>

                  <td>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <span
                        className={
                          product.isActive
                            ? "badge badge-green"
                            : "badge badge-orange"
                        }
                      >
                        {product.isActive ? "Active" : "Inactive"}
                      </span>

                      {product.reviewStatus !== "approved" ? (
                        <span className="badge badge-orange">
                          {product.reviewStatus}
                        </span>
                      ) : null}
                    </div>
                  </td>

                  <td style={{ textAlign: "right" }}>
                    {canEdit || canUpdatePrice ? (
                      <button
                        type="button"
                        onClick={(event) => toggleActionMenu(event, product)}
                        className="hdr-icon"
                        style={{
                          marginLeft: "auto",
                          width: 32,
                          height: 32,
                        }}
                        aria-label={`Open actions for ${product.name}`}
                      >
                        <MoreVertical size={16} />
                      </button>
                    ) : (
                      <span
                        style={{ color: "var(--gray-400)", fontWeight: 900 }}
                      >
                        View only
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {products.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div
                      style={{
                        padding: 26,
                        textAlign: "center",
                        color: "var(--gray-500)",
                        fontWeight: 800,
                      }}
                    >
                      No products found.
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {actionMenu && menuProduct ? (
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            position: "fixed",
            left: actionMenu.x,
            top: actionMenu.y,
            transform:
              actionMenu.direction === "up" ? "translateY(-100%)" : "none",
            width: 215,
            zIndex: 1000,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            boxShadow: "var(--sh-lg)",
            padding: 6,
          }}
        >
          {canEdit ? (
            <button
              type="button"
              onClick={() => openEditModal(menuProduct)}
              className="staff-menu-item"
            >
              <Pencil size={15} />
              Edit details
            </button>
          ) : null}

          {canUpdatePrice ? (
            <button
              type="button"
              onClick={() => openPriceModal(menuProduct)}
              className="staff-menu-item"
            >
              <BadgeDollarSign size={15} />
              Update prices
            </button>
          ) : null}

          {canEdit ? (
            <>
              <div
                style={{
                  height: 1,
                  background: "var(--border)",
                  margin: "6px 0",
                }}
              />

              {menuProduct.isActive ? (
                <button
                  type="button"
                  onClick={() => handleDeactivate(menuProduct)}
                  className="staff-menu-item danger"
                >
                  <PowerOff size={15} />
                  Deactivate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleActivate(menuProduct)}
                  className="staff-menu-item success"
                >
                  <Power size={15} />
                  Activate
                </button>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {modalMode ? (
        <div className="staff-modal-backdrop">
          <div className="staff-modal">
            <div className="staff-modal-header">
              <div>
                <div className="staff-modal-icon">
                  {modalMode === "price" ? (
                    <BadgeDollarSign size={22} />
                  ) : modalMode === "edit" ? (
                    <Pencil size={22} />
                  ) : (
                    <Package size={22} />
                  )}
                </div>

                <h2>{modalTitle}</h2>
                <p>{modalDescription}</p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="staff-modal-close"
              >
                <X size={18} />
              </button>
            </div>

            {modalMode === "create" ? (
              <form onSubmit={handleCreateProduct} className="staff-modal-body">
                <ProductForm
                  name={name}
                  sku={sku}
                  categoryName={categoryName}
                  brand={brand}
                  model={model}
                  description={description}
                  buyingPriceRwf={buyingPriceRwf}
                  sellingPriceRwf={sellingPriceRwf}
                  minSellingPriceRwf={minSellingPriceRwf}
                  lowStockAlert={lowStockAlert}
                  warrantyText={warrantyText}
                  categories={categories}
                  setName={setName}
                  setSku={setSku}
                  setCategoryName={setCategoryName}
                  setBrand={setBrand}
                  setModel={setModel}
                  setDescription={setDescription}
                  setBuyingPriceRwf={setBuyingPriceRwf}
                  setSellingPriceRwf={setSellingPriceRwf}
                  setMinSellingPriceRwf={setMinSellingPriceRwf}
                  setLowStockAlert={setLowStockAlert}
                  setWarrantyText={setWarrantyText}
                  includeSku
                  includePrices
                />

                <ModalFooter
                  onCancel={closeModal}
                  saving={saving}
                  label="Create product"
                />
              </form>
            ) : null}

            {modalMode === "edit" ? (
              <form onSubmit={handleUpdateProduct} className="staff-modal-body">
                <ProductForm
                  name={name}
                  sku={sku}
                  categoryName={categoryName}
                  brand={brand}
                  model={model}
                  description={description}
                  buyingPriceRwf={buyingPriceRwf}
                  sellingPriceRwf={sellingPriceRwf}
                  minSellingPriceRwf={minSellingPriceRwf}
                  lowStockAlert={lowStockAlert}
                  warrantyText={warrantyText}
                  categories={categories}
                  setName={setName}
                  setSku={setSku}
                  setCategoryName={setCategoryName}
                  setBrand={setBrand}
                  setModel={setModel}
                  setDescription={setDescription}
                  setBuyingPriceRwf={setBuyingPriceRwf}
                  setSellingPriceRwf={setSellingPriceRwf}
                  setMinSellingPriceRwf={setMinSellingPriceRwf}
                  setLowStockAlert={setLowStockAlert}
                  setWarrantyText={setWarrantyText}
                />

                <ModalFooter
                  onCancel={closeModal}
                  saving={saving}
                  label="Save changes"
                />
              </form>
            ) : null}

            {modalMode === "price" ? (
              <form onSubmit={handleUpdatePrices} className="staff-modal-body">
                <div className="staff-form-grid">
                  <label className="staff-form-group">
                    <span>Buying price</span>
                    <input
                      type="number"
                      value={buyingPriceRwf}
                      onChange={(event) =>
                        setBuyingPriceRwf(event.target.value)
                      }
                      min={0}
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Selling price</span>
                    <input
                      type="number"
                      value={sellingPriceRwf}
                      onChange={(event) =>
                        setSellingPriceRwf(event.target.value)
                      }
                      min={0}
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Minimum selling price</span>
                    <input
                      type="number"
                      value={minSellingPriceRwf}
                      onChange={(event) =>
                        setMinSellingPriceRwf(event.target.value)
                      }
                      min={0}
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Reason</span>
                    <input
                      value={priceReason}
                      onChange={(event) => setPriceReason(event.target.value)}
                      placeholder="Example: Market price update"
                    />
                  </label>
                </div>

                <ModalFooter
                  onCancel={closeModal}
                  saving={saving}
                  label="Update prices"
                />
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

type ProductFormProps = {
  name: string;
  sku: string;
  categoryName: string;
  brand: string;
  model: string;
  description: string;
  buyingPriceRwf: string;
  sellingPriceRwf: string;
  minSellingPriceRwf: string;
  lowStockAlert: string;
  warrantyText: string;
  categories: ProductCategory[];
  setName: (value: string) => void;
  setSku: (value: string) => void;
  setCategoryName: (value: string) => void;
  setBrand: (value: string) => void;
  setModel: (value: string) => void;
  setDescription: (value: string) => void;
  setBuyingPriceRwf: (value: string) => void;
  setSellingPriceRwf: (value: string) => void;
  setMinSellingPriceRwf: (value: string) => void;
  setLowStockAlert: (value: string) => void;
  setWarrantyText: (value: string) => void;
  includeSku?: boolean;
  includePrices?: boolean;
};

function ProductForm({
  name,
  sku,
  categoryName,
  brand,
  model,
  description,
  buyingPriceRwf,
  sellingPriceRwf,
  minSellingPriceRwf,
  lowStockAlert,
  warrantyText,
  categories,
  setName,
  setSku,
  setCategoryName,
  setBrand,
  setModel,
  setDescription,
  setBuyingPriceRwf,
  setSellingPriceRwf,
  setMinSellingPriceRwf,
  setLowStockAlert,
  setWarrantyText,
  includeSku = false,
  includePrices = false,
}: ProductFormProps) {
  return (
    <>
      <div className="staff-form-grid">
        <label className="staff-form-group">
          <span>Product name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Example: Oraimo 20W Type-C Fast Charger"
            required
          />
        </label>

        <label className="staff-form-group">
          <span>Category</span>
          <input
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
            list="product-categories"
            placeholder="Example: Chargers"
          />
          <datalist id="product-categories">
            {categories.map((category) => (
              <option key={category.id} value={category.name} />
            ))}
          </datalist>
        </label>

        <label className="staff-form-group">
          <span>Brand</span>
          <input
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            placeholder="Example: Oraimo"
          />
        </label>

        <label className="staff-form-group">
          <span>Model</span>
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="Example: OCW-20W"
          />
        </label>

        {includeSku ? (
          <label className="staff-form-group">
            <span>SKU optional</span>
            <input
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              placeholder="Leave empty to auto-generate"
            />
          </label>
        ) : null}

        <label className="staff-form-group">
          <span>Low stock alert</span>
          <input
            type="number"
            value={lowStockAlert}
            onChange={(event) => setLowStockAlert(event.target.value)}
            min={0}
          />
        </label>

        <label className="staff-form-group">
          <span>Warranty</span>
          <input
            value={warrantyText}
            onChange={(event) => setWarrantyText(event.target.value)}
            placeholder="Example: 1 month warranty"
          />
        </label>
      </div>

      <label className="staff-form-group">
        <span>Description</span>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Short product description"
        />
      </label>

      {includePrices ? (
        <div className="staff-form-grid">
          <label className="staff-form-group">
            <span>Buying price</span>
            <input
              type="number"
              value={buyingPriceRwf}
              onChange={(event) => setBuyingPriceRwf(event.target.value)}
              min={0}
            />
          </label>

          <label className="staff-form-group">
            <span>Selling price</span>
            <input
              type="number"
              value={sellingPriceRwf}
              onChange={(event) => setSellingPriceRwf(event.target.value)}
              min={0}
            />
          </label>

          <label className="staff-form-group">
            <span>Minimum selling price</span>
            <input
              type="number"
              value={minSellingPriceRwf}
              onChange={(event) => setMinSellingPriceRwf(event.target.value)}
              min={0}
            />
          </label>
        </div>
      ) : null}
    </>
  );
}

type ModalFooterProps = {
  onCancel: () => void;
  saving: boolean;
  label: string;
};

function ModalFooter({ onCancel, saving, label }: ModalFooterProps) {
  return (
    <div className="staff-modal-footer">
      <button
        type="button"
        onClick={onCancel}
        className="staff-btn staff-btn-outline"
      >
        Cancel
      </button>

      <AsyncButton loading={saving} type="submit">
        <Plus size={15} />
        {label}
      </AsyncButton>
    </div>
  );
}
