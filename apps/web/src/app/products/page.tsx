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
import type { FormEvent, MouseEvent, ReactNode } from "react";
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
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import styles from "./page.module.css";

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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function ProductsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [visibleProductsCount, setVisibleProductsCount] = useState(12);

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

  const visibleProducts = useMemo(
    () => products.slice(0, visibleProductsCount),
    [products, visibleProductsCount],
  );

  const hasMoreProducts = visibleProductsCount < products.length;

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
      setVisibleProductsCount(12);
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
    event: MouseEvent<HTMLButtonElement>,
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
      <div className={styles.productsPage}>
        <section className={`dashboard-hero ${styles.hero}`}>
          <div className={styles.heroCopy}>
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

          <div className={`dashboard-hero-actions ${styles.heroActions}`}>
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

        <div className={styles.metricsGrid}>
          <MetricCard
            icon={<Package size={20} />}
            label="Products"
            value={String(products.length)}
            help="All product profiles in the shop"
            badge="Total"
            badgeClass="badge badge-blue"
          />

          <MetricCard
            icon={<CheckCircle2 size={20} />}
            label="Active products"
            value={String(activeProducts.length)}
            help="Products available for normal selling"
            badge="Active"
            badgeClass="badge badge-green"
          />

          <MetricCard
            icon={<Boxes size={20} />}
            label="Total stock units"
            value={String(totalStockUnits)}
            help="Sellable stock from received arrivals"
            badge="Stock"
            badgeClass="badge badge-green"
          />

          <MetricCard
            icon={<AlertTriangle size={20} />}
            label="Low stock alerts"
            value={String(lowStockProducts.length)}
            help="Products at or below alert quantity"
            badge="Low stock"
            badgeClass="badge badge-orange"
          />
        </div>

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        <section className={`table-card premium-panel ${styles.listPanel}`}>
          <div className="table-card-header">
            <div>
              <div className="table-title">Product list</div>
              <div className="app-subtitle">
                Search, create, edit, update prices, activate, and deactivate
                products.
              </div>
            </div>

            <div className={styles.listHeaderRight}>
              <span className="badge badge-blue">
                {products.length} record(s)
              </span>

              {loading ? (
                <Loader2
                  className="spin"
                  size={20}
                  style={{ color: "var(--orange)" }}
                />
              ) : null}
            </div>
          </div>

          <div className={styles.listToolbar}>
            <form onSubmit={handleSearch} className={styles.searchForm}>
              <div className="hdr-search">
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

          <div className={styles.productGrid}>
            {visibleProducts.map((product) => {
              const isLowStock =
                product.isActive &&
                product.currentStock <= product.lowStockAlert;

              return (
                <article key={product.id} className={styles.productCard}>
                  <div className={styles.productCardTop}>
                    <div className={styles.productIdentity}>
                      <div className={styles.productIcon}>
                        <Package size={19} />
                      </div>

                      <div>
                        <h3>{product.name}</h3>
                        <p>
                          {product.brand || "No brand"} ·{" "}
                          {product.model || "No model"}
                        </p>
                        <span>SKU: {product.sku}</span>
                      </div>
                    </div>

                    {canEdit || canUpdatePrice ? (
                      <button
                        type="button"
                        onClick={(event) => toggleActionMenu(event, product)}
                        className={styles.cardActionButton}
                        aria-label={`Open actions for ${product.name}`}
                      >
                        <MoreVertical size={16} />
                      </button>
                    ) : (
                      <span className={styles.viewOnly}>View only</span>
                    )}
                  </div>

                  <div className={styles.badgeRow}>
                    <span className="badge badge-blue">
                      {product.categoryName || "Uncategorized"}
                    </span>

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

                  <div className={styles.productInfoGrid}>
                    <MiniInfo
                      label="Selling price"
                      value={formatRwf(product.sellingPriceRwf)}
                    />

                    <MiniInfo
                      label="Current stock"
                      value={`${product.currentStock} unit(s)`}
                      tone={isLowStock ? "warning" : "success"}
                    />

                    <MiniInfo
                      label="Alert quantity"
                      value={String(product.lowStockAlert)}
                    />

                    <MiniInfo
                      label="Hidden status"
                      value={`${inactiveProducts.length} inactive`}
                    />
                  </div>

                  {canSeeBuyingPrice ? (
                    <div className={styles.priceProof}>
                      <div>
                        <span>Buying price</span>
                        <strong>{formatRwf(product.buyingPriceRwf)}</strong>
                      </div>

                      <div>
                        <span>Minimum selling price</span>
                        <strong>{formatRwf(product.minSellingPriceRwf)}</strong>
                      </div>
                    </div>
                  ) : null}

                  {product.warrantyText || product.description ? (
                    <div className={styles.productNotes}>
                      {product.warrantyText ? (
                        <span>Warranty: {product.warrantyText}</span>
                      ) : null}
                      {product.description ? (
                        <span>{product.description}</span>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}

            {products.length === 0 ? (
              <div className={styles.emptyState}>
                <Package size={22} />
                <strong>No products found</strong>
                <span>
                  Create a product profile first. Stock quantity will be added
                  later from New Stock Arrivals.
                </span>
              </div>
            ) : null}
          </div>

          {hasMoreProducts ? (
            <div className={styles.loadMoreBox}>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() =>
                  setVisibleProductsCount((current) => current + 12)
                }
              >
                Load more products
              </button>
            </div>
          ) : null}
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
                <form
                  onSubmit={handleCreateProduct}
                  className="staff-modal-body"
                >
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
                <form
                  onSubmit={handleUpdateProduct}
                  className="staff-modal-body"
                >
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
                <form
                  onSubmit={handleUpdatePrices}
                  className="staff-modal-body"
                >
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
