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
import { FormEvent, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";

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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

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
    event: React.MouseEvent<HTMLButtonElement>,
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
      <section className="dashboard-hero">
        <div>
          <span className="hero-kicker dashboard-kicker">
            <Users size={15} />
            Customer profiles
          </span>

          <h1>Customers</h1>

          <p>
            Manage customers for existing-customer sales, pay-later records,
            deposits, and follow-up when someone takes a product and promises to
            pay later.
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
              Create customer
            </button>
          ) : null}
        </div>
      </section>

      <div className="premium-stats-grid">
        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <Users size={20} />
            </div>
            <span className="badge badge-blue">Total</span>
          </div>
          <div className="stat-label">Customers</div>
          <div className="stat-value">{customers.length}</div>
          <div className="stat-help">All customer profiles in the system</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <CheckCircle2 size={20} />
            </div>
            <span className="badge badge-green">Active</span>
          </div>
          <div className="stat-label">Active customers</div>
          <div className="stat-value">{activeCustomers.length}</div>
          <div className="stat-help">Customers available for new sales</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <User size={20} />
            </div>
            <span className="badge badge-blue">Phone</span>
          </div>
          <div className="stat-label">With phone number</div>
          <div className="stat-value">{customersWithPhone.length}</div>
          <div className="stat-help">Useful for payment follow-up</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <PowerOff size={20} />
            </div>
            <span className="badge badge-orange">Inactive</span>
          </div>
          <div className="stat-label">Inactive customers</div>
          <div className="stat-value">{inactiveCustomers.length}</div>
          <div className="stat-help">Customers hidden from normal work</div>
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
            <div className="table-title">Customer list</div>
            <div className="app-subtitle">
              Search, create, edit, activate, and deactivate customers.
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

        <div className="tbl-overflow">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Notes</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
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
                        <User size={19} />
                      </div>

                      <div>
                        <div
                          style={{ fontWeight: 900, color: "var(--gray-900)" }}
                        >
                          {customer.name}
                        </div>
                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 11,
                            color: "var(--gray-400)",
                            fontWeight: 800,
                          }}
                        >
                          Created {formatDate(customer.createdAt)}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span className="badge badge-blue">
                      {customer.phone || "No phone"}
                    </span>
                  </td>

                  <td>
                    <span style={{ color: "var(--gray-700)", fontWeight: 800 }}>
                      {customer.address || "No address"}
                    </span>
                  </td>

                  <td>
                    <span
                      style={{
                        color: "var(--gray-500)",
                        fontWeight: 750,
                        lineHeight: 1.5,
                      }}
                    >
                      {customer.notes || "No notes"}
                    </span>
                  </td>

                  <td>
                    <span
                      className={
                        customer.isActive
                          ? "badge badge-green"
                          : "badge badge-orange"
                      }
                    >
                      {customer.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td style={{ textAlign: "right" }}>
                    {canEdit || canViewDebts ? (
                      <button
                        type="button"
                        onClick={(event) => toggleActionMenu(event, customer)}
                        className="hdr-icon"
                        style={{
                          marginLeft: "auto",
                          width: 32,
                          height: 32,
                        }}
                        aria-label={`Open actions for ${customer.name}`}
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

              {customers.length === 0 ? (
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
                      No customers found.
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
                window.location.href = "/debts";
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
                  {modalMode === "create" ? "Create customer" : "Save changes"}
                </AsyncButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
