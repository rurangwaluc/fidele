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
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  WalletCards,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AsyncButton } from "@/components/ui/AsyncButton";
import styles from "./page.module.css";

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

  const completedSetupCount = useMemo(() => {
    if (!settings) return 0;

    return [
      Boolean(settings.business.businessName),
      Boolean(settings.business.shopName),
      Boolean(settings.business.phone),
      Boolean(settings.business.address),
      Boolean(settings.report.reportBusinessName),
      Boolean(settings.system.currency),
    ].filter(Boolean).length;
  }, [settings]);

  const readySummary = settings
    ? `${completedSetupCount} of 6 important setup fields are filled.`
    : "Load settings to see shop setup.";

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
      <div className={styles.settingsPage}>
        <section className={`dashboard-hero ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className="hero-kicker dashboard-kicker">
              <SettingsIcon size={15} />
              Owner-only setup
            </span>

            <h1>Settings</h1>

            <p>
              Manage shop identity, report details, cash rules, and system
              preferences from one safe owner page.
            </p>
          </div>

          <div className={`dashboard-hero-actions ${styles.heroActions}`}>
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

        {message ? <div className={styles.messageBox}>{message}</div> : null}

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
          <div className={styles.ownerOnlyNotice}>
            <ShieldCheck size={20} />
            <div>
              <strong>Owner-only page</strong>
              <span>Only the owner can view and change shop settings.</span>
            </div>
          </div>
        ) : null}

        {!loading && ownerCanEdit ? (
          <>
            <section className={styles.setupCard}>
              <div className={styles.setupIntro}>
                <div className="feature-icon">
                  <ShieldCheck size={21} />
                </div>

                <div>
                  <strong>Shop setup is owner-controlled</strong>
                  <span>{readySummary}</span>
                </div>
              </div>

              <div className={styles.statusGrid}>
                <StatusMini
                  label="Business"
                  value={businessName || "Not set"}
                />
                <StatusMini label="Shop" value={shopName || "Not set"} />
                <StatusMini label="Currency" value={currency || "Rwf"} />
                <StatusMini
                  label="Cash rule"
                  value={requireOpenCashForSales ? "Strict" : "Flexible"}
                />
              </div>
            </section>

            <div className={styles.metricsGrid}>
              <MetricCard
                icon={<Building2 size={20} />}
                label="Business profile"
                value={businessName || "Not set"}
                help="Main shop identity used inside the system"
                badge="Identity"
                badgeClass="badge badge-blue"
              />

              <MetricCard
                icon={<FileText size={20} />}
                label="Report name"
                value={reportBusinessName || "Not set"}
                help="Name shown on reports and proof documents"
                badge="Reports"
                badgeClass="badge badge-green"
              />

              <MetricCard
                icon={<WalletCards size={20} />}
                label="Bank accounts"
                value={String(cleanBankAccounts(bankAccounts).length)}
                help="Accounts saved for business payment details"
                badge="Money"
                badgeClass="badge badge-orange"
              />

              <MetricCard
                icon={<Globe size={20} />}
                label="Currency"
                value={currency || "Rwf"}
                help="Money label used across the shop system"
                badge="System"
                badgeClass="badge badge-blue"
              />
            </div>

            <div className={styles.settingsGrid}>
              <form
                onSubmit={handleSaveBusiness}
                className={`table-card premium-panel ${styles.businessPanel}`}
              >
                <div className="table-card-header">
                  <div>
                    <div className="table-title">Business profile</div>
                    <div className="app-subtitle">
                      This information appears in the system, reports, and
                      future receipts.
                    </div>
                  </div>

                  <Building2 size={20} style={{ color: "var(--orange)" }} />
                </div>

                <div className={styles.formBody}>
                  <div className={styles.formGrid}>
                    <label className="staff-form-group">
                      <span>Business name</span>
                      <input
                        value={businessName}
                        onChange={(event) =>
                          setBusinessName(event.target.value)
                        }
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

                  <section className={styles.bankSection}>
                    <div className={styles.sectionTop}>
                      <div>
                        <div className="staff-form-section-title">
                          Bank accounts
                        </div>
                        <p>
                          Add only real account details that should appear in
                          business records.
                        </p>
                      </div>

                      <button
                        className="btn btn-outline btn-sm"
                        type="button"
                        onClick={addBankAccount}
                      >
                        <Plus size={13} />
                        Add account
                      </button>
                    </div>

                    <div className={styles.bankList}>
                      {bankAccounts.map((account, index) => (
                        <div key={index} className={styles.bankCard}>
                          <div className={styles.bankCardTop}>
                            <strong>Bank account {index + 1}</strong>

                            <button
                              className="btn btn-red-outline btn-sm"
                              type="button"
                              onClick={() => removeBankAccount(index)}
                            >
                              <Trash2 size={13} />
                              Remove
                            </button>
                          </div>

                          <div className={styles.formGrid}>
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
                        </div>
                      ))}

                      {bankAccounts.length === 0 ? (
                        <div className={styles.emptyBankCard}>
                          <WalletCards size={18} />
                          <div>
                            <strong>No bank account added</strong>
                            <span>
                              Click “Add account” if the shop needs bank details
                              on reports or payment records.
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <div className={styles.formFooter}>
                    <AsyncButton loading={saving === "business"} type="submit">
                      <Save size={15} />
                      Save business profile
                    </AsyncButton>
                  </div>
                </div>
              </form>

              <div className={styles.sideStack}>
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

                  <div className={styles.formBody}>
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

                    <div className={styles.formFooter}>
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

                  <div className={styles.formBody}>
                    <label className="staff-form-group">
                      <span>Currency</span>
                      <input
                        value={currency}
                        onChange={(event) => setCurrency(event.target.value)}
                        placeholder="Example: Rwf"
                        required
                      />
                    </label>

                    <div className={styles.formFooter}>
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

                  <div className={styles.formBody}>
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

                    <div className={styles.formFooter}>
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

type StatusMiniProps = {
  label: string;
  value: string;
};

function StatusMini({ label, value }: StatusMiniProps) {
  return (
    <div className={styles.statusMini}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type CashRuleProps = {
  icon: ReactNode;
  title: string;
  text: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function CashRule({ icon, title, text, checked, onChange }: CashRuleProps) {
  return (
    <label className={checked ? styles.cashRuleChecked : styles.cashRule}>
      <div className="feature-icon">{icon}</div>

      <div className={styles.cashRuleText}>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>

      <div className={styles.ruleControl}>
        {checked ? <CheckCircle2 size={18} /> : null}
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
    </label>
  );
}
