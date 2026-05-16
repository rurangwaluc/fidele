"use client";

import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type {
  Dispatch,
  FormEvent,
  MouseEvent,
  ReactNode,
  SetStateAction,
} from "react";
import {
  ResponsibilityGroupOption,
  StaffUser,
  activateStaff,
  createStaff,
  deactivateStaff,
  getStaff,
  getStaffAccessOptions,
  resetStaffPassword,
  updateStaffAccess,
  updateStaffDetails,
} from "@/lib/staff";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import { getToken } from "@/lib/auth";
import styles from "./page.module.css";

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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [groups, setGroups] = useState<ResponsibilityGroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [visibleStaffCount, setVisibleStaffCount] = useState(8);

  const [modalMode, setModalMode] = useState<StaffModalMode>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);

  const [name, setName] = useState("Sales Employee");
  const [email, setEmail] = useState("employee2@elc.com");
  const [phone, setPhone] = useState("0782222222");
  const [password, setPassword] = useState("Employee@12345");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([
    "seller",
    "cashier",
  ]);

  const activeEmployees = useMemo(
    () => staff.filter((user) => user.role === "employee" && user.isActive),
    [staff],
  );

  const inactiveEmployees = useMemo(
    () => staff.filter((user) => user.role === "employee" && !user.isActive),
    [staff],
  );

  const owner = staff.find((user) => user.role === "owner");
  const employeeLimitReached = activeEmployees.length >= 2;

  const filteredStaff = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return staff;

    return staff.filter((user) => {
      const responsibilityText = user.responsibilityGroups
        .map((group) => `${group.name} ${group.key}`)
        .join(" ")
        .toLowerCase();

      return (
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        (user.phone || "").toLowerCase().includes(term) ||
        user.role.toLowerCase().includes(term) ||
        responsibilityText.includes(term)
      );
    });
  }, [search, staff]);

  const visibleStaff = useMemo(
    () => filteredStaff.slice(0, visibleStaffCount),
    [filteredStaff, visibleStaffCount],
  );

  const hasMoreStaff = visibleStaffCount < filteredStaff.length;

  const assignedResponsibilityCount = useMemo(() => {
    const uniqueGroups = new Set<string>();

    staff.forEach((user) => {
      user.responsibilityGroups.forEach((group) => {
        uniqueGroups.add(group.key);
      });
    });

    return uniqueGroups.size;
  }, [staff]);

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
      setVisibleStaffCount(8);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load staff.",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleActionMenu(
    event: MouseEvent<HTMLButtonElement>,
    user: StaffUser,
  ) {
    event.stopPropagation();

    if (actionMenu?.staffId === user.id) {
      setActionMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 225;
    const menuHeight = 230;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const direction: "down" | "up" =
      spaceBelow < menuHeight && spaceAbove > spaceBelow ? "up" : "down";

    setActionMenu({
      staffId: user.id,
      direction,
      x: Math.max(
        12,
        Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12),
      ),
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
        : [...current, key],
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
      setMessage(
        error instanceof Error ? error.message : "Could not create employee.",
      );
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
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update employee details.",
      );
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
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update responsibilities.",
      );
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
      setMessage(
        error instanceof Error ? error.message : "Could not reset password.",
      );
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
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not deactivate employee.",
      );
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
      setMessage(
        error instanceof Error ? error.message : "Could not activate employee.",
      );
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
      <div className={styles.staffPage}>
        <section className={`dashboard-hero ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className="hero-kicker dashboard-kicker">
              <ShieldCheck size={15} />
              Owner controlled access
            </span>

            <h1>Staff accounts</h1>

            <p>
              This shop has one owner and two employees. The owner creates each
              account, edits employees, resets passwords, and controls
              responsibilities.
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

        <div className={styles.metricsGrid}>
          <MetricCard
            icon={<ShieldCheck size={20} />}
            label="Owner"
            value={owner ? "1" : "0"}
            help="Main business account"
            badge="Protected"
            badgeClass="badge badge-green"
          />

          <MetricCard
            icon={<UsersRound size={20} />}
            label="Active employees"
            value={`${activeEmployees.length}/2`}
            help={`${inactiveEmployees.length} inactive employee account(s)`}
            badge="Fixed"
            badgeClass="badge badge-orange"
          />

          <MetricCard
            icon={<SlidersHorizontal size={20} />}
            label="Responsibilities"
            value={`${assignedResponsibilityCount}/${groups.length || 5}`}
            help="Manager, seller, cashier, storekeeper"
            badge="Control"
            badgeClass="badge badge-blue"
          />

          <MetricCard
            icon={<KeyRound size={20} />}
            label="Password reset"
            value="Owner only"
            help="Owner can reset employee passwords"
            badge="Ready"
            badgeClass="badge badge-green"
          />
        </div>

        {message ? <div className={styles.messageBox}>{message}</div> : null}

        <section className={`table-card premium-panel ${styles.listPanel}`}>
          <div className="table-card-header">
            <div>
              <div className="table-title">Current users</div>
              <div className="app-subtitle">
                Owner and employees who can access this shop system.
              </div>
            </div>

            <div className={styles.listHeaderRight}>
              <span className="badge badge-blue">
                {filteredStaff.length} user(s)
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

          <div className={styles.toolbar}>
            <div className="hdr-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleStaffCount(8);
                }}
                placeholder="Search name, email, phone, role, responsibility..."
              />
            </div>

            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                setSearch("");
                setVisibleStaffCount(8);
              }}
            >
              Clear
            </button>
          </div>

          <div className={styles.staffGrid}>
            {visibleStaff.map((user) => (
              <article key={user.id} className={styles.staffCard}>
                <div className={styles.staffCardTop}>
                  <div className={styles.staffIdentity}>
                    <div
                      className={cx(
                        styles.staffIcon,
                        user.role === "owner" && styles.ownerIcon,
                      )}
                    >
                      {user.role === "owner" ? (
                        <ShieldCheck size={19} />
                      ) : (
                        <UserRound size={19} />
                      )}
                    </div>

                    <div>
                      <h3>{user.name}</h3>
                      <p>{user.email}</p>
                      <span>{user.phone || "No phone"}</span>
                    </div>
                  </div>

                  {user.role === "owner" ? (
                    <span className={styles.protectedText}>Protected</span>
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => toggleActionMenu(event, user)}
                      className={styles.cardActionButton}
                      aria-label={`Open actions for ${user.name}`}
                    >
                      <MoreVertical size={16} />
                    </button>
                  )}
                </div>

                <div className={styles.badgeRow}>
                  <span className="badge badge-blue">{user.role}</span>

                  <span
                    className={
                      user.isActive ? "badge badge-green" : "badge badge-orange"
                    }
                  >
                    {user.isActive ? "Active" : "Inactive"}
                  </span>

                  {user.role === "owner" ? (
                    <span className="badge badge-orange">
                      <ShieldCheck size={12} />
                      Full control
                    </span>
                  ) : null}
                </div>

                {user.role === "owner" ? (
                  <div className={styles.ownerControlBox}>
                    <ShieldCheck size={16} />
                    <div>
                      <strong>Owner account</strong>
                      <span>
                        Full access. This account cannot be edited from staff
                        actions.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className={styles.responsibilityBlock}>
                    <span>Responsibilities</span>

                    {user.responsibilityGroups.length > 0 ? (
                      <div className={styles.responsibilityBadges}>
                        {user.responsibilityGroups.map((group) => (
                          <span key={group.key} className="badge badge-blue">
                            {group.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <strong>No responsibility selected</strong>
                    )}
                  </div>
                )}
              </article>
            ))}

            {filteredStaff.length === 0 ? (
              <div className={styles.emptyState}>
                <UsersRound size={22} />
                <strong>No staff found</strong>
                <span>
                  Try another search, or create an employee if the shop still
                  has fewer than two active employees.
                </span>
              </div>
            ) : null}
          </div>

          {hasMoreStaff ? (
            <div className={styles.loadMoreBox}>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setVisibleStaffCount((current) => current + 8)}
              >
                Load more users
              </button>
            </div>
          ) : null}
        </section>

        {actionMenu && menuUser ? (
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "fixed",
              left: actionMenu.x,
              top: actionMenu.y,
              transform:
                actionMenu.direction === "up" ? "translateY(-100%)" : "none",
              width: 225,
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
                <PowerOff size={15} />
                Deactivate
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleActivate(menuUser.id)}
                className="staff-menu-item success"
              >
                <Power size={15} />
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
                  onSubmit={handleCreateEmployee}
                  className="staff-modal-body"
                >
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

                  <ModalFooter
                    onCancel={closeModal}
                    saving={saving}
                    label="Create employee"
                  />
                </form>
              ) : null}

              {modalMode === "edit" ? (
                <form
                  onSubmit={handleUpdateDetails}
                  className="staff-modal-body"
                >
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

                  <ModalFooter
                    onCancel={closeModal}
                    saving={saving}
                    label="Save changes"
                  />
                </form>
              ) : null}

              {modalMode === "access" ? (
                <form
                  onSubmit={handleUpdateAccess}
                  className="staff-modal-body"
                >
                  <ResponsibilitiesPicker
                    groups={groups}
                    selectedGroups={selectedGroups}
                    toggleGroup={toggleGroup}
                  />

                  <ModalFooter
                    onCancel={closeModal}
                    saving={saving}
                    label="Update access"
                  />
                </form>
              ) : null}

              {modalMode === "password" ? (
                <form
                  onSubmit={handleResetPassword}
                  className="staff-modal-body"
                >
                  <label className="staff-form-group">
                    <span>New temporary password</span>
                    <div className={styles.passwordField}>
                      <input
                        className={styles.passwordInput}
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className={styles.passwordToggle}
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? (
                          <EyeOff size={17} />
                        ) : (
                          <Eye size={17} />
                        )}
                      </button>
                    </div>
                  </label>

                  <ModalFooter
                    onCancel={closeModal}
                    saving={saving}
                    label="Reset password"
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
  setShowPassword: Dispatch<SetStateAction<boolean>>;
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
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
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
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>

      {includePassword ? (
        <label className="staff-form-group">
          <span>Temporary password</span>
          <div className={styles.passwordField}>
            <input
              className={styles.passwordInput}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className={styles.passwordToggle}
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

      <div className={styles.responsibilityGrid}>
        {groups.map((group) => {
          const selected = selectedGroups.includes(group.key);

          return (
            <button
              key={group.key}
              type="button"
              onClick={() => toggleGroup(group.key)}
              className={cx(
                styles.responsibilityCard,
                selected && styles.responsibilityCardSelected,
              )}
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
