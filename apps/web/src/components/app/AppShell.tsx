"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ChevronLeft,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  AuthUser,
  clearToken,
  getCurrentUser,
  getToken,
  logoutUser,
} from "@/lib/auth";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getProblems } from "@/lib/problems";

type AppShellProps = {
  children: React.ReactNode;
  title: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string | null;
  permissions?: string[];
  ownerOnly?: boolean;
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: BarChart3,
  },
  {
    href: "/sales",
    label: "Sell",
    icon: ShoppingCart,
    permissions: ["sales.create", "cash.receivePayment"],
  },
  {
    href: "/products",
    label: "Products",
    icon: Package,
    permissions: ["products.view", "products.create", "products.update"],
  },
  {
    href: "/inventory",
    label: "Stock",
    icon: Boxes,
    permissions: [
      "stock.view",
      "stock.receive",
      "stock.adjust",
      "stock.count",
      "stock.markDamaged",
      "stock.markMissing",
    ],
  },
  {
    href: "/customers",
    label: "Customers",
    icon: Users,
    permissions: ["customers.view", "customers.create", "customers.update"],
  },
  {
    href: "/debts",
    label: "Debts",
    icon: WalletCards,
    permissions: ["debts.create", "debts.recordPayment", "debts.writeOff"],
  },
  {
    href: "/cash",
    label: "Money",
    icon: WalletCards,
    permissions: [
      "cash.receivePayment",
      "cash.closeDay",
      "cash.viewDifference",
    ],
  },
  {
    href: "/staff",
    label: "Staff",
    icon: ShieldCheck,
    permissions: [
      "staff.view",
      "staff.create",
      "staff.update",
      "staff.deactivate",
      "staff.managePermissions",
    ],
    ownerOnly: true,
  },
  {
    href: "/expenses",
    label: "Expenses",
    icon: ReceiptText,
    permissions: ["expenses.create", "expenses.approve"],
  },
  {
    href: "/reports",
    label: "Reports",
    icon: ReceiptText,
    permissions: ["reports.view"],
  },
  {
    href: "/problems",
    label: "Problems",
    icon: AlertTriangle,
    permissions: ["problems.view"],
  },
  {
    href: "#settings-later",
    label: "Settings",
    icon: Settings,
    permissions: ["settings.update"],
    ownerOnly: true,
  },
];

function hasPermission(user: AuthUser, required?: string[]) {
  if (user.role === "owner") return true;
  if (user.permissions.includes("*")) return true;
  if (!required || required.length === 0) return true;

  return required.some((permission) => user.permissions.includes(permission));
}

function canSeeNavItem(user: AuthUser, item: NavItem) {
  if (item.ownerOnly && user.role !== "owner") return false;
  return hasPermission(user, item.permissions);
}

function getTodayDate() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

export function AppShell({ children, title }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [problemsCount, setProblemsCount] = useState<number | null>(null);

  useEffect(() => {
    async function loadUser() {
      const token = getToken();

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const result = await getCurrentUser(token);
        setUser(result.user);
      } catch {
        clearToken();
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, [router]);

  useEffect(() => {
    async function loadProblemsCount() {
      const token = getToken();

      if (!token || !user) return;

      if (!hasPermission(user, ["problems.view"])) {
        setProblemsCount(null);
        return;
      }

      try {
        const response = await getProblems(token, getTodayDate());

        const problemsToFix =
          Number(response.summary.critical || 0) +
          Number(response.summary.warning || 0);

        setProblemsCount(problemsToFix);
      } catch {
        setProblemsCount(null);
      }
    }

    loadProblemsCount();
  }, [user, pathname]);

  const initials = useMemo(() => {
    if (!user?.name) return "U";

    return user.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user?.name]);

  const visibleNavItems = useMemo(() => {
    if (!user) return [];
    return navItems.filter((item) => canSeeNavItem(user, item));
  }, [user]);

  async function handleLogout() {
    const token = getToken();

    try {
      if (token) {
        await logoutUser(token);
      }
    } finally {
      clearToken();
      router.replace("/login");
    }
  }

  if (loading) {
    return (
      <main className="app-loading">
        <div className="loading-card">
          <div className="brand-icon">E</div>
          <div>
            <strong>Opening shop control...</strong>
            <p>Checking your account access.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!user) return null;

  return (
    <div className="app">
      <div
        className={sidebarOpen ? "sb-overlay show" : "sb-overlay"}
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        className={[
          "sidebar",
          sidebarOpen ? "mobile-open" : "",
          collapsed ? "collapsed" : "",
        ].join(" ")}
      >
        <div className="sidebar-logo">
          <div className="logo-icon">E</div>
          <span className="logo-text">ElectroControl</span>

          <button
            className="collapse-btn"
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={13} />
          </button>
        </div>

        <div className="sb-search">
          <div className="sb-search-wrap">
            <Search size={13} />
            <input type="text" placeholder="Search..." />
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Shop Control</div>

          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isRealLink = item.href.startsWith("/");
            const active = isRealLink && pathname === item.href;

            const badge =
              item.href === "/problems"
                ? problemsCount === null
                  ? null
                  : String(problemsCount)
                : item.badge;

            const content = (
              <>
                <Icon size={16} />
                <span className="nav-label">{item.label}</span>
                {badge !== null && badge !== undefined ? (
                  <span
                    className="nav-badge"
                    style={
                      item.href === "/problems" && Number(badge) > 0
                        ? {
                            background: "var(--red)",
                            color: "#fff",
                          }
                        : undefined
                    }
                  >
                    {badge}
                  </span>
                ) : null}
              </>
            );

            if (isRealLink) {
              return (
                <a
                  key={item.label}
                  className={active ? "nav-item active" : "nav-item"}
                  href={item.href}
                  data-label={item.label}
                  onClick={() => setSidebarOpen(false)}
                >
                  {content}
                </a>
              );
            }

            return (
              <button
                key={item.label}
                className="nav-item nav-button"
                type="button"
                data-label={item.label}
                onClick={() => setSidebarOpen(false)}
              >
                {content}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-text">
              <strong>{user.name}</strong>
              <span>
                {user.role === "owner" ? "Owner account" : "Employee account"}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="header premium-header">
          <button
            className="mobile-menu-btn"
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <div>
            <div className="app-title">{title}</div>
            <div className="app-subtitle">
              {user.name} · {user.role === "owner" ? "Owner" : "Employee"}
            </div>
          </div>

          <div className="hdr-search app-header-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search products, customers, debts..."
            />
          </div>

          <div className="hdr-actions">
            <ThemeToggle />

            <button
              className="hdr-icon"
              type="button"
              aria-label="System status"
            >
              <span className="status-dot" />
            </button>

            <button
              className="btn btn-outline"
              type="button"
              onClick={handleLogout}
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </header>

        <main className="content premium-content">{children}</main>
      </div>
    </div>
  );
}
