"use client";

import {
  Loader2,
  Package,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  X,
} from "lucide-react";
import { AuthUser, getCurrentUser, getToken } from "@/lib/auth";
import type { FormEvent } from "react";
import {
  Product,
  activateProduct,
  createProduct,
  deactivateProduct,
  getProducts,
  updateProductDetails,
  updateProductPrices,
} from "@/lib/products";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import styles from "./page.module.css";

type ProductModalMode = "create" | "edit" | null;
type ProductFilter = "all" | "needs-stock" | "hidden";

function formatRwf(value: number) {
  return `Rwf ${Number(value || 0).toLocaleString("en-US")}`;
}

function hasPermission(user: AuthUser | null, permission: string) {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (user.permissions.includes("*")) return true;
  return user.permissions.includes(permission);
}

function productDetails(product: Product) {
  return [product.categoryName, product.brand, product.model]
    .filter(Boolean)
    .join(" / ");
}

function productStatus(product: Product) {
  if (!product.isActive) {
    return { label: "Hidden", tone: styles.statusMuted };
  }

  if (product.currentStock <= 0) {
    return { label: "Out of stock", tone: styles.statusDanger };
  }

  if (product.currentStock <= product.lowStockAlert) {
    return { label: "Low stock", tone: styles.statusWarning };
  }

  return { label: "In stock", tone: styles.statusSuccess };
}

export default function ProductsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [visibleProductsCount, setVisibleProductsCount] = useState(10);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalMode, setModalMode] = useState<ProductModalMode>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [name, setName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [sellingPriceRwf, setSellingPriceRwf] = useState("");
  const [minSellingPriceRwf, setMinSellingPriceRwf] = useState("");
  const [lowStockAlert, setLowStockAlert] = useState("1");

  const canCreate = hasPermission(user, "products.create");
  const canEdit = hasPermission(user, "products.update");
  const canUpdatePrice = hasPermission(user, "products.updatePrice");
  const canEditPrices = user?.role === "owner" || canUpdatePrice;

  const needsStockCount = useMemo(
    () =>
      products.filter(
        (product) =>
          product.isActive && product.currentStock <= product.lowStockAlert,
      ).length,
    [products],
  );

  const hiddenCount = useMemo(
    () => products.filter((product) => !product.isActive).length,
    [products],
  );

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products
      .filter((product) => {
        if (filter === "needs-stock") {
          return product.isActive && product.currentStock <= product.lowStockAlert;
        }

        if (filter === "hidden") {
          return !product.isActive;
        }

        return true;
      })
      .filter((product) => {
        if (!term) return true;

        return (
          product.name.toLowerCase().includes(term) ||
          product.sku.toLowerCase().includes(term) ||
          (product.brand || "").toLowerCase().includes(term) ||
          (product.model || "").toLowerCase().includes(term) ||
          (product.categoryName || "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const aPriority = !a.isActive
          ? 3
          : a.currentStock <= 0
            ? 0
            : a.currentStock <= a.lowStockAlert
              ? 1
              : 2;
        const bPriority = !b.isActive
          ? 3
          : b.currentStock <= 0
            ? 0
            : b.currentStock <= b.lowStockAlert
              ? 1
              : 2;

        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.name.localeCompare(b.name);
      });
  }, [filter, products, search]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleProductsCount),
    [filteredProducts, visibleProductsCount],
  );

  const hasMoreProducts = visibleProductsCount < filteredProducts.length;

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
      setVisibleProductsCount(10);
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
    setCategoryName("");
    setBrand("");
    setModel("");
    setSellingPriceRwf("");
    setMinSellingPriceRwf("");
    setLowStockAlert("1");
    setFormError("");
  }

  function openCreateModal() {
    resetForm();
    setSelectedProduct(null);
    setModalMode("create");
  }

  function openEditModal(product: Product) {
    setSelectedProduct(product);
    setName(product.name);
    setCategoryName(product.categoryName || "");
    setBrand(product.brand || "");
    setModel(product.model || "");
    setSellingPriceRwf(String(product.sellingPriceRwf));
    setMinSellingPriceRwf(
      product.minSellingPriceRwf > 0 ? String(product.minSellingPriceRwf) : "",
    );
    setLowStockAlert(String(product.lowStockAlert));
    setFormError("");
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode(null);
    setSelectedProduct(null);
    setSaving(false);
    resetForm();
  }

  function validateProductForm() {
    const sellingPrice = Number(sellingPriceRwf || 0);
    const minimumPrice = Number(minSellingPriceRwf || 0);
    const shouldValidatePrices = modalMode === "create" || canEditPrices;

    if (!name.trim()) return "Enter the product name.";
    if (!categoryName.trim()) return "Enter the product category.";
    if (shouldValidatePrices && sellingPrice <= 0) {
      return "Selling price must be greater than zero.";
    }
    if (shouldValidatePrices && minimumPrice < 0) {
      return "Lowest allowed price cannot be negative.";
    }
    if (shouldValidatePrices && minimumPrice > sellingPrice) {
      return "Lowest allowed price cannot be higher than the selling price.";
    }
    if (Number(lowStockAlert || 0) < 0) {
      return "Low-stock alert cannot be negative.";
    }

    return "";
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token) return;

    const validationMessage = validateProductForm();
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }

    setSaving(true);
    setFormError("");
    setMessage("");

    try {
      await createProduct(token, {
        name: name.trim(),
        categoryName: categoryName.trim(),
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        sellingPriceRwf: Number(sellingPriceRwf),
        minSellingPriceRwf: Number(minSellingPriceRwf || 0),
        lowStockAlert: Number(lowStockAlert || 1),
      });

      closeModal();
      setSearch("");
      setFilter("all");
      await loadData();
      setMessage("Product added successfully.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not add product.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token || !selectedProduct) return;

    const validationMessage = validateProductForm();
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }

    setSaving(true);
    setFormError("");
    setMessage("");

    try {
      await updateProductDetails(token, selectedProduct.id, {
        name: name.trim(),
        categoryName: categoryName.trim(),
        brand: brand.trim(),
        model: model.trim(),
        lowStockAlert: Number(lowStockAlert || 1),
      });

      if (canEditPrices) {
        const nextSellingPrice = Number(sellingPriceRwf);
        const nextMinimumPrice = Number(minSellingPriceRwf || 0);
        const priceChanged =
          nextSellingPrice !== selectedProduct.sellingPriceRwf ||
          nextMinimumPrice !== selectedProduct.minSellingPriceRwf;

        if (priceChanged) {
          await updateProductPrices(token, selectedProduct.id, {
            sellingPriceRwf: nextSellingPrice,
            minSellingPriceRwf: nextMinimumPrice,
            reason: "Product pricing updated",
          });
        }
      }

      closeModal();
      await loadData();
      setMessage("Product updated successfully.");
    } catch (error) {
      setFormError(
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
      await loadData();
      setMessage(`${product.name} is now hidden from selling.`);
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
      await loadData();
      setMessage(`${product.name} is available for selling again.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not show product.",
      );
    }
  }

  return (
    <AppShell title="Products">
      <main className={styles.productsPage}>
        <section className={styles.commandBar}>
          <div className={styles.commandCopy}>
            <div className={styles.commandTitleRow}>
              <h1>Product catalog</h1>
            </div>
            <p>
              Keep product details and selling rules clean. Quantity and purchase
              cost are handled in Stock.
            </p>
          </div>

          {canCreate ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={openCreateModal}
            >
              <Plus size={15} />
              Add product
            </button>
          ) : null}
        </section>

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        <section className={styles.catalogPanel}>
          <div className={styles.toolbar}>
            <label className={styles.searchBox}>
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleProductsCount(10);
                }}
                placeholder="Search product, category, brand or model"
                aria-label="Search products"
              />
              {search ? (
                <button
                  type="button"
                  className={styles.clearSearch}
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              ) : null}
            </label>

            <div className={styles.filters} aria-label="Product filters">
              <button
                type="button"
                className={filter === "all" ? styles.filterActive : ""}
                onClick={() => {
                  setFilter("all");
                  setVisibleProductsCount(10);
                }}
              >
                All <span>{products.length}</span>
              </button>
              <button
                type="button"
                className={filter === "needs-stock" ? styles.filterActive : ""}
                onClick={() => {
                  setFilter("needs-stock");
                  setVisibleProductsCount(10);
                }}
              >
                Needs stock <span>{needsStockCount}</span>
              </button>
              <button
                type="button"
                className={filter === "hidden" ? styles.filterActive : ""}
                onClick={() => {
                  setFilter("hidden");
                  setVisibleProductsCount(10);
                }}
              >
                Hidden <span>{hiddenCount}</span>
              </button>
            </div>
          </div>

          <div className={styles.listMeta}>
            <span>
              {filteredProducts.length === products.length && !search
                ? `${products.length} products`
                : `${filteredProducts.length} matching products`}
            </span>
          </div>

          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 className="spin" size={22} />
              Loading products...
            </div>
          ) : (
            <div className={styles.productList}>
              <div className={styles.productHeader}>
                <span>Product</span>
                <span>Selling price</span>
                <span>Stock</span>
                <span>Status</span>
                <span>Actions</span>
              </div>

              {visibleProducts.map((product) => {
                const status = productStatus(product);
                const details = productDetails(product);

                return (
                  <article key={product.id} className={styles.productRow}>
                    <div className={styles.productMain}>
                      <div className={styles.productIdentity}>
                        <strong>{product.name}</strong>
                        <span>{details || "Uncategorized"}</span>
                      </div>
                    </div>

                    <div className={styles.priceCell}>
                      <strong>{formatRwf(product.sellingPriceRwf)}</strong>
                      {product.minSellingPriceRwf > 0 ? (
                        <span>
                          Lowest {formatRwf(product.minSellingPriceRwf)}
                        </span>
                      ) : (
                        <span>No price floor</span>
                      )}
                    </div>

                    <div className={styles.stockCell}>
                      <strong
                        className={
                          product.isActive &&
                          product.currentStock <= product.lowStockAlert
                            ? styles.stockAttention
                            : ""
                        }
                      >
                        {product.currentStock}
                      </strong>
                      <span>Alert at {product.lowStockAlert}</span>
                    </div>

                    <div className={styles.statusCell}>
                      <span className={`${styles.statusBadge} ${status.tone}`}>
                        {status.label}
                      </span>
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
                <div className={styles.emptyState}>
                  <Package size={22} />
                  <strong>
                    {products.length === 0
                      ? "No products yet"
                      : "No matching products"}
                  </strong>
                  <span>
                    {products.length === 0
                      ? "Add the first product to start building the catalog."
                      : "Try another search or product filter."}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {hasMoreProducts ? (
            <button
              className={styles.loadMoreButton}
              type="button"
              onClick={() =>
                setVisibleProductsCount((current) => current + 10)
              }
            >
              Show 10 more
            </button>
          ) : null}
        </section>

        {modalMode ? (
          <div className="staff-modal-backdrop">
            <div className={`staff-modal ${styles.productModal}`}>
              <div className="staff-modal-header">
                <div className={styles.modalHeading}>
                  <div className="staff-modal-icon">
                    {modalMode === "edit" ? (
                      <Pencil size={21} />
                    ) : (
                      <Package size={21} />
                    )}
                  </div>
                  <div>
                    <h2>
                      {modalMode === "create" ? "Add product" : "Edit product"}
                    </h2>
                    <p>
                      {modalMode === "create"
                        ? "Add only the information needed to identify and sell this product."
                        : "Keep product details and selling rules accurate."}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="staff-modal-close"
                  aria-label="Close"
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
                className={`staff-modal-body ${styles.productForm}`}
              >
                {formError ? (
                  <div className={styles.formError}>{formError}</div>
                ) : null}

                <ProductForm
                  mode={modalMode}
                  name={name}
                  categoryName={categoryName}
                  brand={brand}
                  model={model}
                  sellingPriceRwf={sellingPriceRwf}
                  minSellingPriceRwf={minSellingPriceRwf}
                  lowStockAlert={lowStockAlert}
                  canEditPrices={modalMode === "create" || canEditPrices}
                  setName={setName}
                  setCategoryName={setCategoryName}
                  setBrand={setBrand}
                  setModel={setModel}
                  setSellingPriceRwf={setSellingPriceRwf}
                  setMinSellingPriceRwf={setMinSellingPriceRwf}
                  setLowStockAlert={setLowStockAlert}
                />

                <ModalFooter
                  onCancel={closeModal}
                  saving={saving}
                  label={modalMode === "create" ? "Add product" : "Save changes"}
                />
              </form>
            </div>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}

type ProductFormProps = {
  mode: "create" | "edit";
  name: string;
  categoryName: string;
  brand: string;
  model: string;
  sellingPriceRwf: string;
  minSellingPriceRwf: string;
  lowStockAlert: string;
  canEditPrices: boolean;
  setName: (value: string) => void;
  setCategoryName: (value: string) => void;
  setBrand: (value: string) => void;
  setModel: (value: string) => void;
  setSellingPriceRwf: (value: string) => void;
  setMinSellingPriceRwf: (value: string) => void;
  setLowStockAlert: (value: string) => void;
};

function ProductForm({
  mode,
  name,
  categoryName,
  brand,
  model,
  sellingPriceRwf,
  minSellingPriceRwf,
  lowStockAlert,
  canEditPrices,
  setName,
  setCategoryName,
  setBrand,
  setModel,
  setSellingPriceRwf,
  setMinSellingPriceRwf,
  setLowStockAlert,
}: ProductFormProps) {
  return (
    <>
      <section className={styles.formSection}>
        <div className={styles.sectionHeading}>
          <strong>Product information</strong>
          <span>Basic details used when searching and selling.</span>
        </div>

        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Product name *</span>
            <input
              className={styles.productInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Example: Oraimo 20W Type-C Fast Charger"
              autoFocus={mode === "create"}
              required
            />
          </label>

          <label className={styles.field}>
            <span>Category *</span>
            <input
              className={styles.productInput}
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="Type a category, e.g. Chargers"
              required
            />
          </label>

          <label className={styles.field}>
            <span>Brand <em>Optional</em></span>
            <input
              className={styles.productInput}
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              placeholder="Example: Oraimo"
            />
          </label>

          <label className={styles.field}>
            <span>Model <em>Optional</em></span>
            <input
              className={styles.productInput}
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="Example: OCW-20W"
            />
          </label>
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.sectionHeading}>
          <strong>Selling & stock alerts</strong>
          <span>Set the selling price and choose when low stock should be flagged.</span>
        </div>

        <div className={styles.formGridThree}>
          {canEditPrices ? (
            <label className={styles.field}>
              <span>Selling price (Rwf) *</span>
              <input
                className={styles.productInput}
                type="number"
                inputMode="numeric"
                value={sellingPriceRwf}
                onChange={(event) => setSellingPriceRwf(event.target.value)}
                min={1}
                placeholder="Enter selling price"
                required
              />
            </label>
          ) : null}

          {canEditPrices ? (
            <label className={styles.field}>
              <span>Lowest allowed price <em>Optional</em></span>
              <input
                className={styles.productInput}
                type="number"
                inputMode="numeric"
                value={minSellingPriceRwf}
                onChange={(event) => setMinSellingPriceRwf(event.target.value)}
                min={0}
                placeholder="No price floor"
              />
              <small>Sales below this amount require approval.</small>
            </label>
          ) : null}

          <label className={styles.field}>
            <span>Low-stock alert quantity</span>
            <input
              className={styles.productInput}
              type="number"
              inputMode="numeric"
              value={lowStockAlert}
              onChange={(event) => setLowStockAlert(event.target.value)}
              min={0}
            />
            <small>Warn when stock reaches this quantity.</small>
          </label>
        </div>
      </section>

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
        {label}
      </AsyncButton>
    </div>
  );
}
