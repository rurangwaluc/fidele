"use client";

import { AuthUser, getCurrentUser, getToken } from "@/lib/auth";
import {
  BankAccount,
  ShopSettings,
  getSettings,
  updateBusinessSettings,
  updateCashRules,
  updateReportSettings,
  updateSystemSettings,
} from "@/lib/settings";
import {
  Banknote,
  Building2,
  CheckCircle2,
  FileText,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  WalletCards,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";

type SaveMode = "business" | "report" | "cash" | "system" | null;

function cleanBankAccounts(accounts: BankAccount[]) {
  return accounts
    .map((account) => ({
      bankName: account.bankName.trim(),
      accountName: account.accountName?.trim() || null,
      accountNumber: account.accountNumber.trim(),
      notes: account.notes?.trim() || null,
    }))
    .filter((account) => account.bankName && account.accountNumber);
}

function isOwner(user: AuthUser | null) {
  return user?.role === "owner";
}

function emptyBankAccount(): BankAccount {
  return {
    bankName: "",
    accountName: "",
    accountNumber: "",
    notes: "",
  };
}

export default function SettingsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<ShopSettings | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SaveMode>(null);
  const [message, setMessage] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [momoCode, setMomoCode] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [reportBusinessName, setReportBusinessName] = useState("");
  const [reportFooterText, setReportFooterText] = useState("");

  const [currency, setCurrency] = useState("Rwf");

  const [requireOpenCashForSales, setRequireOpenCashForSales] = useState(true);
  const [requireOpenCashForDebtPayments, setRequireOpenCashForDebtPayments] =
    useState(true);
  const [requireOpenCashForPaidExpenses, setRequireOpenCashForPaidExpenses] =
    useState(true);
  const [allowOwnerCashReopen, setAllowOwnerCashReopen] = useState(true);

  const ownerCanEdit = isOwner(user);

  const readySummary = useMemo(() => {
    if (!settings) {
      return "Load settings to see shop setup.";
    }

    const completed = [
      Boolean(settings.business.businessName),
      Boolean(settings.business.shopName),
      Boolean(settings.business.phone),
      Boolean(settings.business.address),
      Boolean(settings.report.reportBusinessName),
      Boolean(settings.system.currency),
    ].filter(Boolean).length;

    return `${completed} of 6 important setup fields are filled.`;
  }, [settings]);

  useEffect(() => {
    loadSettings();
  }, []);

  function fillForm(nextSettings: ShopSettings) {
    setBusinessName(nextSettings.business.businessName || "");
    setShopName(nextSettings.business.shopName || "");
    setPhone(nextSettings.business.phone || "");
    setEmail(nextSettings.business.email || "");
    setWebsite(nextSettings.business.website || "");
    setAddress(nextSettings.business.address || "");
    setTin(nextSettings.business.tin || "");
    setMomoCode(nextSettings.business.momoCode || "");
    setLogoUrl(nextSettings.business.logoUrl || "");
    setBankAccounts(
      nextSettings.business.bankAccounts.length > 0
        ? nextSettings.business.bankAccounts
        : [],
    );

    setReportBusinessName(nextSettings.report.reportBusinessName || "");
    setReportFooterText(nextSettings.report.reportFooterText || "");
    setCurrency(nextSettings.system.currency || "Rwf");

    setRequireOpenCashForSales(nextSettings.cashRules.requireOpenCashForSales);
    setRequireOpenCashForDebtPayments(
      nextSettings.cashRules.requireOpenCashForDebtPayments,
    );
    setRequireOpenCashForPaidExpenses(
      nextSettings.cashRules.requireOpenCashForPaidExpenses,
    );
    setAllowOwnerCashReopen(nextSettings.cashRules.allowOwnerCashReopen);
  }

  async function loadSettings() {
    const token = getToken();

    if (!token) {
      setMessage("You are not logged in.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const [meResponse, settingsResponse] = await Promise.all([
        getCurrentUser(token),
        getSettings(token),
      ]);

      setUser(meResponse.user);
      setSettings(settingsResponse.settings);
      fillForm(settingsResponse.settings);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load settings.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token) return;

    setSaving("business");
    setMessage("");

    try {
      const response = await updateBusinessSettings(token, {
        businessName,
        shopName,
        phone,
        email,
        website,
        address,
        tin,
        momoCode,
        logoUrl,
        bankAccounts: cleanBankAccounts(bankAccounts),
      });

      setSettings(response.settings);
      fillForm(response.settings);
      setMessage("Business settings saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save business settings.",
      );
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token) return;

    setSaving("report");
    setMessage("");

    try {
      const response = await updateReportSettings(token, {
        reportBusinessName,
        reportFooterText,
      });

      setSettings(response.settings);
      fillForm(response.settings);
      setMessage("Report settings saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save report settings.",
      );
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveCashRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token) return;

    setSaving("cash");
    setMessage("");

    try {
      const response = await updateCashRules(token, {
        requireOpenCashForSales,
        requireOpenCashForDebtPayments,
        requireOpenCashForPaidExpenses,
        allowOwnerCashReopen,
      });

      setSettings(response.settings);
      fillForm(response.settings);
      setMessage("Cash rules saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save cash rules.",
      );
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveSystem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token) return;

    setSaving("system");
    setMessage("");

    try {
      const response = await updateSystemSettings(token, {
        currency,
      });

      setSettings(response.settings);
      fillForm(response.settings);
      setMessage("System settings saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save system settings.",
      );
    } finally {
      setSaving(null);
    }
  }

  function updateBankAccount(
    index: number,
    key: keyof BankAccount,
    value: string,
  ) {
    setBankAccounts((current) =>
      current.map((account, accountIndex) =>
        accountIndex === index
          ? {
              ...account,
              [key]: value,
            }
          : account,
      ),
    );
  }

  function addBankAccount() {
    setBankAccounts((current) => [...current, emptyBankAccount()]);
  }

  function removeBankAccount(index: number) {
    setBankAccounts((current) =>
      current.filter((_, accountIndex) => accountIndex !== index),
    );
  }

  return (
    <AppShell title="Settings">
      <section className="dashboard-hero">
        <div>
          <span className="hero-kicker dashboard-kicker">
            <Settings size={15} />
            Owner-only setup
          </span>

          <h1>Settings</h1>

          <p>
            Manage shop identity, report details, cash rules, and system
            preferences from one safe owner page.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <button
            className="btn btn-outline"
            type="button"
            onClick={loadSettings}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </section>

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

      {loading ? (
        <div className="loading-card">
          <Loader2 className="spin" size={18} />
          <div>
            <strong>Loading settings...</strong>
            <p>Preparing shop setup.</p>
          </div>
        </div>
      ) : null}

      {!loading && !ownerCanEdit ? (
        <div
          className="table-card premium-panel"
          style={{
            marginBottom: 18,
            padding: 16,
            borderColor: "rgba(245, 158, 11, 0.35)",
            background: "var(--gold-lt)",
            color: "var(--gray-900)",
            fontWeight: 800,
          }}
        >
          Only the owner can view and change shop settings.
        </div>
      ) : null}

      {!loading && ownerCanEdit ? (
        <>
          <section
            className="table-card premium-panel"
            style={{
              marginBottom: 18,
              padding: 18,
              borderColor: "rgba(34, 197, 94, 0.22)",
              background: "var(--green-lt)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr repeat(3, minmax(0, 1fr))",
                gap: 14,
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div className="feature-icon" style={{ marginBottom: 0 }}>
                  <ShieldCheck size={21} />
                </div>

                <div>
                  <div
                    style={{
                      color: "var(--gray-900)",
                      fontSize: 18,
                      fontWeight: 950,
                      letterSpacing: "-0.3px",
                    }}
                  >
                    Shop setup is owner-controlled
                  </div>

                  <div
                    style={{
                      marginTop: 5,
                      color: "var(--gray-600)",
                      fontSize: 13,
                      fontWeight: 800,
                      lineHeight: 1.45,
                    }}
                  >
                    {readySummary}
                  </div>
                </div>
              </div>

              <StatusMini label="Business" value={businessName || "Not set"} />
              <StatusMini label="Currency" value={currency || "Rwf"} />
              <StatusMini
                label="Cash rule"
                value={requireOpenCashForSales ? "Strict" : "Flexible"}
              />
            </div>
          </section>

          <div className="dashboard-grid">
            <form
              onSubmit={handleSaveBusiness}
              className="table-card premium-panel"
            >
              <div className="table-card-header">
                <div>
                  <div className="table-title">Business profile</div>
                  <div className="app-subtitle">
                    This information appears in the system, reports, and future
                    receipts.
                  </div>
                </div>

                <Building2 size={20} style={{ color: "var(--orange)" }} />
              </div>

              <div className="staff-modal-body">
                <div className="staff-form-grid">
                  <label className="staff-form-group">
                    <span>Business name</span>
                    <input
                      value={businessName}
                      onChange={(event) => setBusinessName(event.target.value)}
                      placeholder="Example: Fidele Electronics"
                      required
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Shop name</span>
                    <input
                      value={shopName}
                      onChange={(event) => setShopName(event.target.value)}
                      placeholder="Example: Main Shop"
                      required
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Phone</span>
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="Example: 0780000000"
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Example: shop@example.com"
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Website</span>
                    <input
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                      placeholder="Example: https://example.com"
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Address</span>
                    <input
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder="Example: Kigali, Rwanda"
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>TIN</span>
                    <input
                      value={tin}
                      onChange={(event) => setTin(event.target.value)}
                      placeholder="Business tax number"
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>MoMo code</span>
                    <input
                      value={momoCode}
                      onChange={(event) => setMomoCode(event.target.value)}
                      placeholder="Example: *182*8*..."
                    />
                  </label>
                </div>

                <label className="staff-form-group">
                  <span>Logo URL</span>
                  <input
                    value={logoUrl}
                    onChange={(event) => setLogoUrl(event.target.value)}
                    placeholder="Paste logo image link"
                  />
                </label>

                <div>
                  <div
                    className="staff-form-section-title"
                    style={{ marginBottom: 10 }}
                  >
                    Bank accounts
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    {bankAccounts.map((account, index) => (
                      <div
                        key={index}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 16,
                          padding: 14,
                          background: "var(--gray-50)",
                        }}
                      >
                        <div className="staff-form-grid">
                          <label className="staff-form-group">
                            <span>Bank name</span>
                            <input
                              value={account.bankName}
                              onChange={(event) =>
                                updateBankAccount(
                                  index,
                                  "bankName",
                                  event.target.value,
                                )
                              }
                              placeholder="Example: Bank of Kigali"
                            />
                          </label>

                          <label className="staff-form-group">
                            <span>Account name</span>
                            <input
                              value={account.accountName || ""}
                              onChange={(event) =>
                                updateBankAccount(
                                  index,
                                  "accountName",
                                  event.target.value,
                                )
                              }
                              placeholder="Example: Fidele Electronics"
                            />
                          </label>

                          <label className="staff-form-group">
                            <span>Account number</span>
                            <input
                              value={account.accountNumber}
                              onChange={(event) =>
                                updateBankAccount(
                                  index,
                                  "accountNumber",
                                  event.target.value,
                                )
                              }
                              placeholder="Account number"
                            />
                          </label>

                          <label className="staff-form-group">
                            <span>Notes</span>
                            <input
                              value={account.notes || ""}
                              onChange={(event) =>
                                updateBankAccount(
                                  index,
                                  "notes",
                                  event.target.value,
                                )
                              }
                              placeholder="Optional"
                            />
                          </label>
                        </div>

                        <button
                          className="staff-btn staff-btn-outline"
                          type="button"
                          onClick={() => removeBankAccount(index)}
                          style={{ marginTop: 12 }}
                        >
                          <Trash2 size={14} />
                          Remove account
                        </button>
                      </div>
                    ))}

                    <button
                      className="staff-btn staff-btn-outline"
                      type="button"
                      onClick={addBankAccount}
                    >
                      <Plus size={14} />
                      Add bank account
                    </button>
                  </div>
                </div>

                <div className="staff-modal-footer">
                  <AsyncButton loading={saving === "business"} type="submit">
                    <Save size={15} />
                    Save business profile
                  </AsyncButton>
                </div>
              </div>
            </form>

            <div style={{ display: "grid", gap: 18 }}>
              <form
                onSubmit={handleSaveReport}
                className="table-card premium-panel"
              >
                <div className="table-card-header">
                  <div>
                    <div className="table-title">Report identity</div>
                    <div className="app-subtitle">
                      Controls names and text used on PDF reports.
                    </div>
                  </div>

                  <FileText size={20} style={{ color: "var(--orange)" }} />
                </div>

                <div className="staff-modal-body">
                  <label className="staff-form-group">
                    <span>Report business name</span>
                    <input
                      value={reportBusinessName}
                      onChange={(event) =>
                        setReportBusinessName(event.target.value)
                      }
                      placeholder="Name shown on reports"
                      required
                    />
                  </label>

                  <label className="staff-form-group">
                    <span>Report footer text</span>
                    <input
                      value={reportFooterText}
                      onChange={(event) =>
                        setReportFooterText(event.target.value)
                      }
                      placeholder="Short proof text for reports"
                      required
                    />
                  </label>

                  <div className="staff-modal-footer">
                    <AsyncButton loading={saving === "report"} type="submit">
                      <Save size={15} />
                      Save report identity
                    </AsyncButton>
                  </div>
                </div>
              </form>

              <form
                onSubmit={handleSaveSystem}
                className="table-card premium-panel"
              >
                <div className="table-card-header">
                  <div>
                    <div className="table-title">System preference</div>
                    <div className="app-subtitle">
                      Keep system language simple and consistent.
                    </div>
                  </div>

                  <Globe size={20} style={{ color: "var(--orange)" }} />
                </div>

                <div className="staff-modal-body">
                  <label className="staff-form-group">
                    <span>Currency</span>
                    <input
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value)}
                      placeholder="Example: Rwf"
                      required
                    />
                  </label>

                  <div className="staff-modal-footer">
                    <AsyncButton loading={saving === "system"} type="submit">
                      <Save size={15} />
                      Save system preference
                    </AsyncButton>
                  </div>
                </div>
              </form>

              <form
                onSubmit={handleSaveCashRules}
                className="table-card premium-panel"
              >
                <div className="table-card-header">
                  <div>
                    <div className="table-title">Cash rules</div>
                    <div className="app-subtitle">
                      Decide when cash must be opened before money actions.
                    </div>
                  </div>

                  <WalletCards size={20} style={{ color: "var(--orange)" }} />
                </div>

                <div className="staff-modal-body">
                  <CashRule
                    icon={<Banknote size={17} />}
                    title="Require open cash before sale"
                    text="Block selling when the cash drawer is not open."
                    checked={requireOpenCashForSales}
                    onChange={setRequireOpenCashForSales}
                  />

                  <CashRule
                    icon={<WalletCards size={17} />}
                    title="Require open cash before debt payment"
                    text="Block customer payments when the cash drawer is not open."
                    checked={requireOpenCashForDebtPayments}
                    onChange={setRequireOpenCashForDebtPayments}
                  />

                  <CashRule
                    icon={<FileText size={17} />}
                    title="Require open cash before paid expense"
                    text="Block paid expenses when the cash drawer is not open."
                    checked={requireOpenCashForPaidExpenses}
                    onChange={setRequireOpenCashForPaidExpenses}
                  />

                  <CashRule
                    icon={<ShieldCheck size={17} />}
                    title="Allow owner to reopen cash"
                    text="Owner can reopen a closed day when correction is needed."
                    checked={allowOwnerCashReopen}
                    onChange={setAllowOwnerCashReopen}
                  />

                  <div className="staff-modal-footer">
                    <AsyncButton loading={saving === "cash"} type="submit">
                      <Save size={15} />
                      Save cash rules
                    </AsyncButton>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

type StatusMiniProps = {
  label: string;
  value: string;
};

function StatusMini({ label, value }: StatusMiniProps) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--card)",
        borderRadius: 16,
        padding: 12,
      }}
    >
      <div
        style={{
          color: "var(--gray-500)",
          fontSize: 11,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.4px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 6,
          color: "var(--gray-900)",
          fontSize: 17,
          fontWeight: 950,
          letterSpacing: "-0.2px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

type CashRuleProps = {
  icon: React.ReactNode;
  title: string;
  text: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function CashRule({ icon, title, text, checked, onChange }: CashRuleProps) {
  return (
    <label
      style={{
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 14,
        background: checked ? "var(--green-lt)" : "var(--gray-50)",
        display: "flex",
        gap: 12,
        alignItems: "center",
        cursor: "pointer",
      }}
    >
      <div className="feature-icon" style={{ marginBottom: 0 }}>
        {icon}
      </div>

      <div style={{ flex: 1 }}>
        <strong style={{ color: "var(--gray-900)", fontWeight: 950 }}>
          {title}
        </strong>
        <div
          style={{
            marginTop: 4,
            color: "var(--gray-500)",
            fontSize: 12,
            fontWeight: 750,
            lineHeight: 1.45,
          }}
        >
          {text}
        </div>
      </div>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{
          width: 20,
          height: 20,
          accentColor: "var(--green)",
        }}
      />
    </label>
  );
}
