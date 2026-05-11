"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import { getToken } from "@/lib/auth";
import {
  activateStaff,
  createStaff,
  deactivateStaff,
  getStaff,
  getStaffAccessOptions,
  resetStaffPassword,
  ResponsibilityGroupOption,
  StaffUser,
  updateStaffAccess,
  updateStaffDetails,
} from "@/lib/staff";

type StaffModalMode = "create" | "edit" | "access" | "password" | null;

type ActionMenuState = {
  staffId: string;
  x: number;
  y: number;
  direction: "down" | "up";
};

const groupDescriptions: Record<string, string> = {
  admin_helper: "Helps the owner check staff and activity logs.",
  manager: "Supervises sales, debts, reports, and daily work.",
  seller: "Sells products, creates customers, and records pay-later sales.",
  cashier: "Receives money, records payments, and helps close the day.",
  storekeeper: "Creates products, receives stock, and counts stock.",
};

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [groups, setGroups] = useState<ResponsibilityGroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [modalMode, setModalMode] = useState<StaffModalMode>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);

  const [name, setName] = useState("Sales Employee");
  const [email, setEmail] = useState("employee2@elc.com");
  const [phone, setPhone] = useState("0782222222");
  const [password, setPassword] = useState("Employee@12345");
  const [selectedGroups, setSelectedGroups] = useState<string[]>(["seller", "cashier"]);

  const activeEmployees = useMemo(
    () => staff.filter((user) => user.role === "employee" && user.isActive),
    [staff]
  );

  const owner = staff.find((user) => user.role === "owner");
  const employeeLimitReached = activeEmployees.length >= 2;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!actionMenu) return;

    function closeMenu() {
      setActionMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
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

  async function loadData() {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setMessage("");

    try {
      const [staffResponse, optionsResponse] = await Promise.all([
        getStaff(token),
        getStaffAccessOptions(token),
      ]);

      setStaff(staffResponse.staff);
      setGroups(optionsResponse.responsibilityGroups);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load staff.");
    } finally {
      setLoading(false);
    }
  }

  function toggleActionMenu(
    event: React.MouseEvent<HTMLButtonElement>,
    user: StaffUser
  ) {
    event.stopPropagation();

    if (actionMenu?.staffId === user.id) {
      setActionMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 210;
    const menuHeight = 230;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const direction: "down" | "up" =
      spaceBelow < menuHeight && spaceAbove > spaceBelow ? "up" : "down";

    setActionMenu({
      staffId: user.id,
      direction,
      x: Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12)),
      y: direction === "down" ? rect.bottom + 8 : rect.top - 8,
    });
  }

  function openCreateModal() {
    setActionMenu(null);
    setSelectedStaff(null);
    setName("Sales Employee");
    setEmail("employee2@elc.com");
    setPhone("0782222222");
    setPassword("Employee@12345");
    setSelectedGroups(["seller", "cashier"]);
    setShowPassword(false);
    setModalMode("create");
  }

  function openEditModal(user: StaffUser) {
    setActionMenu(null);
    setSelectedStaff(user);
    setName(user.name);
    setEmail(user.email);
    setPhone(user.phone || "");
    setShowPassword(false);
    setModalMode("edit");
  }

  function openAccessModal(user: StaffUser) {
    setActionMenu(null);
    setSelectedStaff(user);
    setSelectedGroups(user.responsibilityGroups.map((group) => group.key));
    setShowPassword(false);
    setModalMode("access");
  }

  function openPasswordModal(user: StaffUser) {
    setActionMenu(null);
    setSelectedStaff(user);
    setPassword("NewEmployee@12345");
    setShowPassword(false);
    setModalMode("password");
  }

  function closeModal() {
    setModalMode(null);
    setSelectedStaff(null);
    setSaving(false);
    setShowPassword(false);
  }

  function toggleGroup(key: string) {
    setSelectedGroups((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }

  async function handleCreateEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token) return;

    setSaving(true);
    setMessage("");

    try {
      await createStaff(token, {
        name,
        email,
        phone,
        password,
        responsibilityGroupKeys: selectedGroups,
        extraPermissionKeys: [],
      });

      closeModal();
      await loadData();
      setMessage("Employee created successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create employee.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token || !selectedStaff) return;

    setSaving(true);
    setMessage("");

    try {
      await updateStaffDetails(token, selectedStaff.id, {
        name,
        email,
        phone,
      });

      closeModal();
      await loadData();
      setMessage("Employee details updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update employee details.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token || !selectedStaff) return;

    setSaving(true);
    setMessage("");

    try {
      await updateStaffAccess(token, selectedStaff.id, {
        responsibilityGroupKeys: selectedGroups,
        extraPermissionKeys: [],
      });

      closeModal();
      await loadData();
      setMessage("Employee responsibilities updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update responsibilities.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token || !selectedStaff) return;

    setSaving(true);
    setMessage("");

    try {
      await resetStaffPassword(token, selectedStaff.id, {
        password,
      });

      closeModal();
      setMessage("Employee password reset successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reset password.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    const token = getToken();
    if (!token) return;

    setActionMenu(null);
    setMessage("");

    try {
      await deactivateStaff(token, id);
      await loadData();
      setMessage("Employee deactivated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not deactivate employee.");
    }
  }

  async function handleActivate(id: string) {
    const token = getToken();
    if (!token) return;

    setActionMenu(null);
    setMessage("");

    try {
      await activateStaff(token, id);
      await loadData();
      setMessage("Employee activated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not activate employee.");
    }
  }

  const modalTitle =
    modalMode === "create"
      ? "Create employee"
      : modalMode === "edit"
        ? "Edit employee"
        : modalMode === "access"
          ? "Update responsibilities"
          : modalMode === "password"
            ? "Reset employee password"
            : "";

  const modalDescription =
    modalMode === "create"
      ? "Add one employee and choose what they can do in the shop."
      : modalMode === "edit"
        ? "Update the employee name, email, or phone number."
        : modalMode === "access"
          ? "Choose what this employee is allowed to do."
          : modalMode === "password"
            ? "Set a new temporary password for this employee."
            : "";

  const menuUser = actionMenu
    ? staff.find((user) => user.id === actionMenu.staffId)
    : null;

  return (
    <AppShell title="Staff">
      <section className="dashboard-hero">
        <div>
          <span className="hero-kicker dashboard-kicker">
            <ShieldCheck size={15} />
            Owner controlled access
          </span>

          <h1>Staff accounts</h1>

          <p>
            This shop has one owner and two employees. The owner creates each account,
            edits employees, resets passwords, and controls responsibilities.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <button className="btn btn-outline" type="button" onClick={loadData}>
            <RefreshCw size={14} />
            Refresh
          </button>

          <button
            className="btn btn-primary"
            type="button"
            onClick={openCreateModal}
            disabled={employeeLimitReached}
          >
            <Plus size={14} />
            {employeeLimitReached ? "2 employees created" : "Create employee"}
          </button>
        </div>
      </section>

      <div className="premium-stats-grid">
        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <ShieldCheck size={20} />
            </div>
            <span className="badge badge-green">Protected</span>
          </div>
          <div className="stat-label">Owner</div>
          <div className="stat-value">{owner ? "1" : "0"}</div>
          <div className="stat-help">Main business account</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <UsersRound size={20} />
            </div>
            <span className="badge badge-orange">Fixed</span>
          </div>
          <div className="stat-label">Employees</div>
          <div className="stat-value">{activeEmployees.length}/2</div>
          <div className="stat-help">This shop uses two employee accounts</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <SlidersHorizontal size={20} />
            </div>
            <span className="badge badge-blue">Control</span>
          </div>
          <div className="stat-label">Responsibilities</div>
          <div className="stat-value" style={{ fontSize: 24 }}>Owner assigns</div>
          <div className="stat-help">Manager, seller, cashier, storekeeper</div>
        </div>

        <div className="premium-stat-card">
          <div className="stat-card-top">
            <div className="feature-icon">
              <KeyRound size={20} />
            </div>
            <span className="badge badge-green">Ready</span>
          </div>
          <div className="stat-label">Password reset</div>
          <div className="stat-value" style={{ fontSize: 24 }}>Owner only</div>
          <div className="stat-help">Owner can reset employee passwords</div>
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
            <div className="table-title">Current users</div>
            <div className="app-subtitle">
              Owner and employees who can access this shop system.
            </div>
          </div>

          {loading ? <Loader2 className="spin" size={20} style={{ color: "var(--orange)" }} /> : null}
        </div>

        <div className="tbl-overflow">
          <table className="simple-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Responsibilities</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {staff.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        className="feature-icon"
                        style={{
                          marginBottom: 0,
                          width: 42,
                          height: 42,
                          borderRadius: 12,
                        }}
                      >
                        {user.role === "owner" ? (
                          <ShieldCheck size={19} />
                        ) : (
                          <UserRound size={19} />
                        )}
                      </div>

                      <div>
                        <div style={{ fontWeight: 900, color: "var(--gray-900)" }}>
                          {user.name}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--gray-500)",
                            fontWeight: 700,
                            marginTop: 3,
                          }}
                        >
                          {user.email} {user.phone ? `· ${user.phone}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span className="badge badge-blue" style={{ textTransform: "capitalize" }}>
                      {user.role}
                    </span>
                  </td>

                  <td>
                    {user.role === "owner" ? (
                      <span className="badge badge-orange">
                        <ShieldCheck size={12} />
                        Full control
                      </span>
                    ) : user.responsibilityGroups.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {user.responsibilityGroups.map((group) => (
                          <span key={group.key} className="badge badge-blue">
                            {group.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: "var(--gray-400)", fontWeight: 800 }}>
                        No responsibility selected
                      </span>
                    )}
                  </td>

                  <td>
                    <span className={user.isActive ? "badge badge-green" : "badge badge-orange"}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td style={{ textAlign: "right" }}>
                    {user.role === "owner" ? (
                      <span style={{ color: "var(--gray-400)", fontWeight: 900 }}>
                        Protected
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => toggleActionMenu(event, user)}
                        className="hdr-icon"
                        style={{
                          marginLeft: "auto",
                          width: 32,
                          height: 32,
                        }}
                        aria-label={`Open actions for ${user.name}`}
                      >
                        <MoreVertical size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {actionMenu && menuUser ? (
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            position: "fixed",
            left: actionMenu.x,
            top: actionMenu.y,
            transform: actionMenu.direction === "up" ? "translateY(-100%)" : "none",
            width: 210,
            zIndex: 1000,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            boxShadow: "var(--sh-lg)",
            padding: 6,
          }}
        >
          <button
            type="button"
            onClick={() => openEditModal(menuUser)}
            className="staff-menu-item"
          >
            <Pencil size={15} />
            Edit details
          </button>

          <button
            type="button"
            onClick={() => openAccessModal(menuUser)}
            className="staff-menu-item"
          >
            <SlidersHorizontal size={15} />
            Update access
          </button>

          <button
            type="button"
            onClick={() => openPasswordModal(menuUser)}
            className="staff-menu-item"
          >
            <KeyRound size={15} />
            Reset password
          </button>

          <div
            style={{
              height: 1,
              background: "var(--border)",
              margin: "6px 0",
            }}
          />

          {menuUser.isActive ? (
            <button
              type="button"
              onClick={() => handleDeactivate(menuUser.id)}
              className="staff-menu-item danger"
            >
              <X size={15} />
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleActivate(menuUser.id)}
              className="staff-menu-item success"
            >
              <CheckCircle2 size={15} />
              Activate
            </button>
          )}
        </div>
      ) : null}

      {modalMode ? (
        <div className="staff-modal-backdrop">
          <div className="staff-modal">
            <div className="staff-modal-header">
              <div>
                <div className="staff-modal-icon">
                  {modalMode === "password" ? (
                    <KeyRound size={22} />
                  ) : modalMode === "access" ? (
                    <SlidersHorizontal size={22} />
                  ) : modalMode === "edit" ? (
                    <Pencil size={22} />
                  ) : (
                    <UsersRound size={22} />
                  )}
                </div>

                <h2>{modalTitle}</h2>
                <p>{modalDescription}</p>
              </div>

              <button type="button" onClick={closeModal} className="staff-modal-close">
                <X size={18} />
              </button>
            </div>

            {modalMode === "create" ? (
              <form onSubmit={handleCreateEmployee} className="staff-modal-body">
                <EmployeeDetailsForm
                  name={name}
                  email={email}
                  phone={phone}
                  password={password}
                  showPassword={showPassword}
                  setName={setName}
                  setEmail={setEmail}
                  setPhone={setPhone}
                  setPassword={setPassword}
                  setShowPassword={setShowPassword}
                  includePassword
                />

                <ResponsibilitiesPicker
                  groups={groups}
                  selectedGroups={selectedGroups}
                  toggleGroup={toggleGroup}
                />

                <ModalFooter onCancel={closeModal} saving={saving} label="Create employee" />
              </form>
            ) : null}

            {modalMode === "edit" ? (
              <form onSubmit={handleUpdateDetails} className="staff-modal-body">
                <EmployeeDetailsForm
                  name={name}
                  email={email}
                  phone={phone}
                  password={password}
                  showPassword={showPassword}
                  setName={setName}
                  setEmail={setEmail}
                  setPhone={setPhone}
                  setPassword={setPassword}
                  setShowPassword={setShowPassword}
                />

                <ModalFooter onCancel={closeModal} saving={saving} label="Save changes" />
              </form>
            ) : null}

            {modalMode === "access" ? (
              <form onSubmit={handleUpdateAccess} className="staff-modal-body">
                <ResponsibilitiesPicker
                  groups={groups}
                  selectedGroups={selectedGroups}
                  toggleGroup={toggleGroup}
                />

                <ModalFooter onCancel={closeModal} saving={saving} label="Update access" />
              </form>
            ) : null}

            {modalMode === "password" ? (
              <form onSubmit={handleResetPassword} className="staff-modal-body">
                <label className="staff-form-group">
                  <span>New temporary password</span>
                  <div className="password-field">
                    <input
                      className="password-input"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>

                <ModalFooter onCancel={closeModal} saving={saving} label="Reset password" />
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

type EmployeeDetailsFormProps = {
  name: string;
  email: string;
  phone: string;
  password: string;
  showPassword: boolean;
  setName: (value: string) => void;
  setEmail: (value: string) => void;
  setPhone: (value: string) => void;
  setPassword: (value: string) => void;
  setShowPassword: (value: boolean | ((value: boolean) => boolean)) => void;
  includePassword?: boolean;
};

function EmployeeDetailsForm({
  name,
  email,
  phone,
  password,
  showPassword,
  setName,
  setEmail,
  setPhone,
  setPassword,
  setShowPassword,
  includePassword = false,
}: EmployeeDetailsFormProps) {
  return (
    <div className="staff-form-grid">
      <label className="staff-form-group">
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>

      <label className="staff-form-group">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>

      <label className="staff-form-group">
        <span>Phone</span>
        <input value={phone} onChange={(event) => setPhone(event.target.value)} />
      </label>

      {includePassword ? (
        <label className="staff-form-group">
          <span>Temporary password</span>
          <div className="password-field">
            <input
              className="password-input"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
      ) : null}
    </div>
  );
}

type ResponsibilitiesPickerProps = {
  groups: ResponsibilityGroupOption[];
  selectedGroups: string[];
  toggleGroup: (key: string) => void;
};

function ResponsibilitiesPicker({
  groups,
  selectedGroups,
  toggleGroup,
}: ResponsibilitiesPickerProps) {
  return (
    <div>
      <div className="staff-form-section-title">Choose responsibilities</div>

      <div className="staff-responsibility-grid">
        {groups.map((group) => {
          const selected = selectedGroups.includes(group.key);

          return (
            <button
              key={group.key}
              type="button"
              onClick={() => toggleGroup(group.key)}
              className={selected ? "staff-responsibility selected" : "staff-responsibility"}
            >
              <div>
                <strong>{group.label}</strong>
                <p>
                  {groupDescriptions[group.key] ||
                    "Employee can help with this responsibility."}
                </p>
              </div>

              {selected ? <CheckCircle2 size={18} /> : <span />}
            </button>
          );
        })}
      </div>
    </div>
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
      <button type="button" onClick={onCancel} className="staff-btn staff-btn-outline">
        Cancel
      </button>

      <AsyncButton loading={saving} type="submit">
        <Plus size={15} />
        {label}
      </AsyncButton>
    </div>
  );
}