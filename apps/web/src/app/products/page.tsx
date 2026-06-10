"use client";

import {
  AlertTriangle,
  BadgeDollarSign,
  Boxes,
  CheckCircle2,
  Loader2,
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
import type { FormEvent, ReactNode } from "react";
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

type ProductModalMode = "create" | "edit" | null;

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
  const [visibleProductsCount, setVisibleProductsCount] = useState(5);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalMode, setModalMode] = useState<ProductModalMode>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

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
  const [priceReason, setPriceReason] = useState("Owner product update");

  const canCreate = hasPermission(user, "products.create");
  const canEdit = hasPermission(user, "products.update");
  const canUpdatePrice = hasPermission(user, "products.updatePrice");
  const isOwner = user?.role === "owner";
  const canEditPrices = isOwner || canUpdatePrice;

  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive),
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

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return products;

    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        (product.brand || "").toLowerCase().includes(term) ||
        (product.model || "").toLowerCase().includes(term) ||
        (product.categoryName || "").toLowerCase().includes(term)
      );
    });
  }, [products, search]);

  const priorityProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      const aLow = a.isActive && a.currentStock <= a.lowStockAlert;
      const bLow = b.isActive && b.currentStock <= b.lowStockAlert;

      if (aLow && !bLow) return -1;
      if (!aLow && bLow) return 1;
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;

      return a.name.localeCompare(b.name);
    });
  }, [filteredProducts]);

  const visibleProducts = useMemo(
    () => priorityProducts.slice(0, visibleProductsCount),
    [priorityProducts, visibleProductsCount],
  );

  const hasMoreProducts = visibleProductsCount < priorityProducts.length;

  useEffect(() => {
    loadData("");
  }, []);

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
      setVisibleProductsCount(5);
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
    setPriceReason("Owner product update");
  }

  function openCreateModal() {
    resetForm();
    setSelectedProduct(null);
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
    setBuyingPriceRwf(String(product.buyingPriceRwf));
    setSellingPriceRwf(String(product.sellingPriceRwf));
    setMinSellingPriceRwf(String(product.minSellingPriceRwf));
    setLowStockAlert(String(product.lowStockAlert));
    setWarrantyText(product.warrantyText || "");
    setPriceReason("Owner product update");
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode(null);
    setSelectedProduct(null);
    setSaving(false);
    resetForm();
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVisibleProductsCount(5);
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

      if (canEditPrices) {
        await updateProductPrices(token, selectedProduct.id, {
          buyingPriceRwf: Number(buyingPriceRwf || 0),
          sellingPriceRwf: Number(sellingPriceRwf || 0),
          minSellingPriceRwf: Number(minSellingPriceRwf || 0),
          reason: priceReason || "Owner product update",
        });
      }

      closeModal();
      await loadData(search);
      setMessage("Product updated successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update product.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(product: Product) {
    const token = getToken();
    if (!token) return;

    setMessage("");

    try {
      await deactivateProduct(token, product.id);
      await loadData(search);
      setMessage("Product hidden.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not hide product.",
      );
    }
  }

  async function handleActivate(product: Product) {
    const token = getToken();
    if (!token) return;

    setMessage("");

    try {
      await activateProduct(token, product.id);
      await loadData(search);
      setMessage("Product shown.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not show product.",
      );
    }
  }

  return (
    <AppShell title="Products">
      <div className={styles.productsPage}>
        <section className={styles.ownerHero}>
          <div>
            <span className={styles.kicker}>
              <Package size={15} />
              Products
            </span>

            <h1>Product List</h1>

            <p>
              Search products, edit details, update prices, and hide products
              that should not be sold.
            </p>
          </div>

          <div className={styles.heroActions}>
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
                Add Product
              </button>
            ) : null}
          </div>
        </section>

        <section
          className={
            lowStockProducts.length > 0
              ? styles.actionCardWarning
              : styles.actionCardClean
          }
        >
          <div className={styles.actionIcon}>
            {lowStockProducts.length > 0 ? (
              <AlertTriangle size={22} />
            ) : (
              <CheckCircle2 size={22} />
            )}
          </div>

          <div>
            <strong>
              {lowStockProducts.length > 0
                ? "Restock low products first."
                : "Product records look clean."}
            </strong>
            <span>
              {lowStockProducts.length > 0
                ? `${lowStockProducts.length} product(s) are at or below alert quantity.`
                : "No urgent product action needed right now."}
            </span>
          </div>
        </section>

        <div className={styles.summaryStrip}>
          <SummaryMini label="Products" value={String(products.length)} />
          <SummaryMini label="Active" value={String(activeProducts.length)} />
          <SummaryMini
            label="Low stock"
            value={String(lowStockProducts.length)}
            danger={lowStockProducts.length > 0}
          />
        </div>

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        <section className={styles.listingPanel}>
          <div className={styles.listingTop}>
            <div>
              <h2>Products</h2>
              <p>Showing the most important products first.</p>
            </div>

            {loading ? (
              <Loader2
                className="spin"
                size={20}
                style={{ color: "var(--orange)" }}
              />
            ) : (
              <span className="badge badge-blue">
                {filteredProducts.length} record(s)
              </span>
            )}
          </div>

          <div className={styles.toolbar}>
            <form onSubmit={handleSearch} className={styles.searchForm}>
              <div className={styles.searchBox}>
                <Search size={15} />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setVisibleProductsCount(5);
                  }}
                  placeholder="Search product, SKU, brand..."
                />
              </div>

              <button className="btn btn-outline" type="submit">
                Search
              </button>

              <button
                className="btn btn-outline"
                type="button"
                onClick={() => {
                  setSearch("");
                  setVisibleProductsCount(5);
                }}
              >
                Clear
              </button>
            </form>
          </div>

          <div className={styles.productList}>
            <div className={styles.productHeader}>
              <span>Product</span>
              <span>Price</span>
              <span>Stock</span>
              <span>Status</span>
              <span>Action</span>
            </div>

            {visibleProducts.map((product) => {
              const isLowStock =
                product.isActive &&
                product.currentStock <= product.lowStockAlert;

              return (
                <article key={product.id} className={styles.productRow}>
                  <div className={styles.productMain}>
                    <div className={styles.avatarIcon}>
                      <Package size={17} />
                    </div>

                    <div>
                      <strong>{product.name}</strong>
                      <span>
                        {product.sku} · {product.categoryName || "No category"}
                      </span>
                    </div>
                  </div>

                  <div className={styles.productFacts}>
                    <Fact
                      label="Price"
                      value={formatRwf(product.sellingPriceRwf)}
                    />
                    <Fact
                      label="Stock"
                      value={String(product.currentStock)}
                      danger={isLowStock}
                    />
                    <Fact
                      label="Status"
                      value={product.isActive ? "Active" : "Hidden"}
                      danger={!product.isActive}
                    />
                  </div>

                  <div className={styles.rowActions}>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditModal(product)}
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                    ) : null}

                    {canEdit ? (
                      product.isActive ? (
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => handleDeactivate(product)}
                        >
                          <PowerOff size={14} />
                          Hide
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.successButton}
                          onClick={() => handleActivate(product)}
                        >
                          <Power size={14} />
                          Show
                        </button>
                      )
                    ) : null}
                  </div>
                </article>
              );
            })}

            {filteredProducts.length === 0 ? (
              <EmptyCard
                icon={<Package size={22} />}
                title="No products found"
                text="Create a product or search another name, SKU, or brand."
              />
            ) : null}
          </div>

          {hasMoreProducts ? (
            <button
              className={styles.loadMoreButton}
              type="button"
              onClick={() => setVisibleProductsCount((current) => current + 5)}
            >
              Show 5 more products
            </button>
          ) : null}
        </section>

        {modalMode ? (
          <div className="staff-modal-backdrop">
            <div className="staff-modal">
              <div className="staff-modal-header">
                <div>
                  <div className="staff-modal-icon">
                    {modalMode === "edit" ? (
                      <Pencil size={22} />
                    ) : (
                      <Package size={22} />
                    )}
                  </div>

                  <h2>
                    {modalMode === "create"
                      ? "Add new product"
                      : "Edit product"}
                  </h2>
                  <p>
                    {modalMode === "create"
                      ? "Create the product profile. Stock is added from Stock Control."
                      : "Update product details and prices."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="staff-modal-close"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                onSubmit={
                  modalMode === "create"
                    ? handleCreateProduct
                    : handleUpdateProduct
                }
                className="staff-modal-body"
              >
                <ProductForm
                  mode={modalMode}
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
                  priceReason={priceReason}
                  categories={categories}
                  canEditPrices={modalMode === "create" || canEditPrices}
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
                  setPriceReason={setPriceReason}
                />

                <ModalFooter
                  onCancel={closeModal}
                  saving={saving}
                  label={
                    modalMode === "create" ? "Create product" : "Save product"
                  }
                />
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function SummaryMini({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className={styles.summaryMini}>
      <span>{label}</span>
      <strong className={danger ? styles.warningValue : ""}>{value}</strong>
    </div>
  );
}

function Fact({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className={styles.fact}>
      <span>{label}</span>
      <strong className={danger ? styles.warningValue : ""}>{value}</strong>
    </div>
  );
}

type ProductFormProps = {
  mode: "create" | "edit";
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
  priceReason: string;
  categories: ProductCategory[];
  canEditPrices: boolean;
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
  setPriceReason: (value: string) => void;
};

function ProductForm({
  mode,
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
  priceReason,
  categories,
  canEditPrices,
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
  setPriceReason,
}: ProductFormProps) {
  return (
    <>
      <section className={styles.formSection}>
        <div className="staff-form-section-title">Product details</div>

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
            <span>SKU</span>
            <input
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              placeholder={
                mode === "create"
                  ? "Leave empty to auto-generate"
                  : "SKU shown for reference"
              }
              readOnly={mode === "edit"}
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

          <label className="staff-form-group">
            <span>Low stock alert</span>
            <input
              type="number"
              value={lowStockAlert}
              onChange={(event) => setLowStockAlert(event.target.value)}
              min={0}
            />
          </label>
        </div>

        <label className="staff-form-group">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Short product description"
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
      </section>

      {canEditPrices ? (
        <section className={styles.formSection}>
          <div className="staff-form-section-title">Prices</div>

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

            {mode === "edit" ? (
              <label className="staff-form-group">
                <span>Reason</span>
                <input
                  value={priceReason}
                  onChange={(event) => setPriceReason(event.target.value)}
                  placeholder="Example: Market price update"
                />
              </label>
            ) : null}
          </div>
        </section>
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
