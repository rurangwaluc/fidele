"use client";

import { AuthUser, getCurrentUser, getToken } from "@/lib/auth";
import {
  CheckCircle2,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  User,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  Customer,
  activateCustomer,
  createCustomer,
  deactivateCustomer,
  getCustomers,
  updateCustomer,
} from "@/lib/customers";
import type { FormEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";

type CustomerModalMode = "create" | "edit" | null;

type ActionMenuState = {
  customerId: string;
  x: number;
  y: number;
  direction: "down" | "up";
};

function hasPermission(user: AuthUser | null, permission: string) {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (user.permissions.includes("*")) return true;
  return user.permissions.includes(permission);
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

export default function CustomersPage() {
  const router = useRouter();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [visibleCustomersCount, setVisibleCustomersCount] = useState(12);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalMode, setModalMode] = useState<CustomerModalMode>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const canCreate = hasPermission(user, "customers.create");
  const canEdit = hasPermission(user, "customers.update");
  const canViewDebts = hasPermission(user, "debts.recordPayment");

  const activeCustomers = useMemo(
    () => customers.filter((customer) => customer.isActive),
    [customers],
  );

  const inactiveCustomers = useMemo(
    () => customers.filter((customer) => !customer.isActive),
    [customers],
  );

  const customersWithPhone = useMemo(
    () => customers.filter((customer) => customer.phone),
    [customers],
  );

  const visibleCustomers = useMemo(
    () => customers.slice(0, visibleCustomersCount),
    [customers, visibleCustomersCount],
  );

  const hasMoreCustomers = visibleCustomersCount < customers.length;

  useEffect(() => {
    loadData("");
  }, []);

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
      const [meResponse, customersResponse] = await Promise.all([
        getCurrentUser(token),
        getCustomers(token, nextSearch),
      ]);

      setUser(meResponse.user);
      setCustomers(customersResponse.customers);
      setVisibleCustomersCount(12);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load customers.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName("");
    setPhone("");
    setAddress("");
    setNotes("");
  }

  function openCreateModal() {
    resetForm();
    setSelectedCustomer(null);
    setActionMenu(null);
    setModalMode("create");
  }

  function openEditModal(customer: Customer) {
    setSelectedCustomer(customer);
    setName(customer.name);
    setPhone(customer.phone || "");
    setAddress(customer.address || "");
    setNotes(customer.notes || "");
    setActionMenu(null);
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode(null);
    setSelectedCustomer(null);
    setSaving(false);
    resetForm();
  }

  function toggleActionMenu(
    event: MouseEvent<HTMLButtonElement>,
    customer: Customer,
  ) {
    event.stopPropagation();

    if (actionMenu?.customerId === customer.id) {
      setActionMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 160;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const direction: "down" | "up" =
      spaceBelow < menuHeight && spaceAbove > spaceBelow ? "up" : "down";

    setActionMenu({
      customerId: customer.id,
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

  async function handleCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token) return;

    setSaving(true);
    setMessage("");

    try {
      await createCustomer(token, {
        name,
        phone,
        address,
        notes,
      });

      closeModal();
      setSearch("");
      await loadData("");
      setMessage("Customer created successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create customer.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token || !selectedCustomer) return;

    setSaving(true);
    setMessage("");

    try {
      await updateCustomer(token, selectedCustomer.id, {
        name,
        phone,
        address,
        notes,
      });

      closeModal();
      await loadData(search);
      setMessage("Customer updated successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update customer.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(customer: Customer) {
    const token = getToken();
    if (!token) return;

    setActionMenu(null);
    setMessage("");

    try {
      await deactivateCustomer(token, customer.id);
      await loadData(search);
      setMessage("Customer deactivated.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not deactivate customer.",
      );
    }
  }

  async function handleActivate(customer: Customer) {
    const token = getToken();
    if (!token) return;

    setActionMenu(null);
    setMessage("");

    try {
      await activateCustomer(token, customer.id);
      await loadData(search);
      setMessage("Customer activated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not activate customer.",
      );
    }
  }

  const menuCustomer = actionMenu
    ? customers.find((customer) => customer.id === actionMenu.customerId)
    : null;

  const modalTitle =
    modalMode === "create" ? "Create customer" : "Edit customer";

  const modalDescription =
    modalMode === "create"
      ? "Create a customer profile for pay-later sales and future follow-up."
      : "Update customer details used in sales, debts, and follow-up.";

  return (
    <AppShell title="Customers">
      <div className={styles.customersPage}>
        <section className={`dashboard-hero ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className="hero-kicker dashboard-kicker">
              <Users size={15} />
              Customer profiles
            </span>

            <h1>Customers</h1>

            <p>
              Manage customers for existing-customer sales, pay-later records,
              deposits, and follow-up when someone takes a product and promises
              to pay later.
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
                Create customer
              </button>
            ) : null}
          </div>
        </section>

        <div className={styles.metricsGrid}>
          <MetricCard
            icon={<Users size={20} />}
            label="Customers"
            value={String(customers.length)}
            help="All customer profiles in the system"
            badge="Total"
            badgeClass="badge badge-blue"
          />

          <MetricCard
            icon={<CheckCircle2 size={20} />}
            label="Active customers"
            value={String(activeCustomers.length)}
            help="Customers available for new sales"
            badge="Active"
            badgeClass="badge badge-green"
          />

          <MetricCard
            icon={<User size={20} />}
            label="With phone number"
            value={String(customersWithPhone.length)}
            help="Useful for payment follow-up"
            badge="Phone"
            badgeClass="badge badge-blue"
          />

          <MetricCard
            icon={<PowerOff size={20} />}
            label="Inactive customers"
            value={String(inactiveCustomers.length)}
            help="Customers hidden from normal work"
            badge="Inactive"
            badgeClass="badge badge-orange"
          />
        </div>

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        <section className={`table-card premium-panel ${styles.listPanel}`}>
          <div className="table-card-header">
            <div>
              <div className="table-title">Customer list</div>
              <div className="app-subtitle">
                Search, create, edit, activate, and deactivate customers.
              </div>
            </div>

            <div className={styles.listHeaderRight}>
              <span className="badge badge-blue">
                {customers.length} record(s)
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
                  placeholder="Search customer name or phone..."
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

          <div className={styles.customerGrid}>
            {visibleCustomers.map((customer) => (
              <article key={customer.id} className={styles.customerCard}>
                <div className={styles.customerCardTop}>
                  <div className={styles.customerIdentity}>
                    <div className={styles.customerIcon}>
                      <User size={19} />
                    </div>

                    <div>
                      <h3>{customer.name}</h3>
                      <p>Created {formatDate(customer.createdAt)}</p>
                    </div>
                  </div>

                  {canEdit || canViewDebts ? (
                    <button
                      type="button"
                      onClick={(event) => toggleActionMenu(event, customer)}
                      className={styles.cardActionButton}
                      aria-label={`Open actions for ${customer.name}`}
                    >
                      <MoreVertical size={16} />
                    </button>
                  ) : (
                    <span className={styles.viewOnly}>View only</span>
                  )}
                </div>

                <div className={styles.badgeRow}>
                  <span
                    className={
                      customer.isActive
                        ? "badge badge-green"
                        : "badge badge-orange"
                    }
                  >
                    {customer.isActive ? "Active" : "Inactive"}
                  </span>

                  <span className="badge badge-blue">
                    {customer.phone ? "Has phone" : "No phone"}
                  </span>
                </div>

                <div className={styles.customerInfoGrid}>
                  <MiniInfo
                    label="Phone"
                    value={customer.phone || "No phone"}
                    tone={customer.phone ? "success" : "warning"}
                  />

                  <MiniInfo
                    label="Address"
                    value={customer.address || "No address"}
                  />
                </div>

                <div className={styles.customerNotes}>
                  <span>Notes</span>
                  <strong>{customer.notes || "No notes"}</strong>
                </div>
              </article>
            ))}

            {customers.length === 0 ? (
              <div className={styles.emptyState}>
                <Users size={22} />
                <strong>No customers found</strong>
                <span>
                  Create a customer profile first. Customers are needed for pay
                  later, deposits, installments, and follow-up.
                </span>
              </div>
            ) : null}
          </div>

          {hasMoreCustomers ? (
            <div className={styles.loadMoreBox}>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() =>
                  setVisibleCustomersCount((current) => current + 12)
                }
              >
                Load more customers
              </button>
            </div>
          ) : null}
        </section>

        {actionMenu && menuCustomer ? (
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "fixed",
              left: actionMenu.x,
              top: actionMenu.y,
              transform:
                actionMenu.direction === "up" ? "translateY(-100%)" : "none",
              width: 220,
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
                onClick={() => openEditModal(menuCustomer)}
                className="staff-menu-item"
              >
                <Pencil size={15} />
                Edit customer
              </button>
            ) : null}

            {canViewDebts ? (
              <button
                type="button"
                onClick={() => {
                  setActionMenu(null);
                  router.push("/debts");
                }}
                className="staff-menu-item"
              >
                <WalletCards size={15} />
                View debts page
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

                {menuCustomer.isActive ? (
                  <button
                    type="button"
                    onClick={() => handleDeactivate(menuCustomer)}
                    className="staff-menu-item danger"
                  >
                    <PowerOff size={15} />
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleActivate(menuCustomer)}
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
                    <User size={22} />
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

              <form
                onSubmit={
                  modalMode === "create"
                    ? handleCreateCustomer
                    : handleUpdateCustomer
                }
                className="staff-modal-body"
              >
                <div className="staff-form-grid">
                  <label className="staff-form-group">
                    <span>Customer name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Example: Jean Claude"
                      required
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Phone number</span>
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="Example: 0783333333"
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Address</span>
                    <input
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder="Example: Kigali"
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Notes</span>
                    <input
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Example: Usually pays in the evening"
                    />
                  </label>
                </div>

                <div className="staff-modal-footer">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="staff-btn staff-btn-outline"
                  >
                    Cancel
                  </button>

                  <AsyncButton loading={saving} type="submit">
                    <Plus size={15} />
                    {modalMode === "create"
                      ? "Create customer"
                      : "Save changes"}
                  </AsyncButton>
                </div>
              </form>
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
      className={[
        styles.miniInfo,
        tone === "success" ? styles.miniInfoSuccess : "",
        tone === "warning" ? styles.miniInfoWarning : "",
      ].join(" ")}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
