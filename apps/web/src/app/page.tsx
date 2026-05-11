import {
  AlertTriangle,
  Banknote,
  Boxes,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  Package,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Users,
} from "lucide-react";

import { ThemeToggle } from "@/components/ui/ThemeToggle";

const features = [
  {
    icon: <Boxes size={20} />,
    title: "Know your stock",
    text: "See what is available, low, damaged, missing, or reserved.",
  },
  {
    icon: <ShoppingCart size={20} />,
    title: "Track every sale",
    text: "Record walk-in sales, customer sales, pay later, and installments.",
  },
  {
    icon: <Banknote size={20} />,
    title: "Control money",
    text: "Track cash, MoMo, bank payments, expenses, and daily closing.",
  },
  {
    icon: <ShieldCheck size={20} />,
    title: "Control staff actions",
    text: "Know who sold, who received payment, who changed stock, and when.",
  },
];

export default function LandingPage() {
  return (
    <main className="page-shell">
      <header className="landing-header">
        <a className="brand" href="/">
          <span className="brand-icon">E</span>
          <span>ElectroControl</span>
        </a>

        <div className="header-actions">
          <ThemeToggle />
          <a href="/login" className="btn btn-outline">
            Login
          </a>
          <a href="/login" className="btn btn-primary">
            Open System
          </a>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="hero-kicker">
            <CheckCircle2 size={15} />
            One-shop electronics business control system
          </div>

          <h1 className="hero-title">
            Control stock, sales, debts, cash, and staff from{" "}
            <span>one place.</span>
          </h1>

          <p className="hero-text">
            Built for a physical electronics shop where the owner needs to know
            what entered, what sold, who sold it, who owes money, where money
            went, and what every employee did.
          </p>

          <div className="hero-actions">
            <a href="/login" className="btn btn-primary">
              Start with Login
            </a>
            <a href="#features" className="btn btn-outline">
              View Features
            </a>
          </div>

          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Main users</div>
              <div className="stat-value">1 owner + 2 staff</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Currency</div>
              <div className="stat-value">Rwf</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Focus</div>
              <div className="stat-value">Full control</div>
            </div>
          </div>
        </div>

        <div className="preview-card">
          <div className="preview-header">
            <span className="preview-dot" />
            <strong>Shop Dashboard Preview</strong>
          </div>

          <div className="preview-grid">
            <aside className="preview-sidebar">
              <div className="preview-menu">
                <div className="active">
                  <LayoutDashboard size={15} />
                  <span>Dashboard</span>
                </div>
                <div>
                  <ShoppingCart size={15} />
                  <span>Sell</span>
                </div>
                <div>
                  <Package size={15} />
                  <span>Stock</span>
                </div>
                <div>
                  <Users size={15} />
                  <span>Debts</span>
                </div>
                <div>
                  <ReceiptText size={15} />
                  <span>Money</span>
                </div>
              </div>
            </aside>

            <section className="preview-content">
              <div className="preview-top">
                <div>
                  <div className="preview-title">Today in the shop</div>
                  <div
                    style={{
                      color: "var(--gray-400)",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Kigali main shop
                  </div>
                </div>
                <span className="badge badge-green">Open</span>
              </div>

              <div className="preview-stats">
                <div className="stat-card">
                  <div className="stat-label">Sales</div>
                  <div className="stat-value">Rwf 850k</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Debts</div>
                  <div className="stat-value">Rwf 120k</div>
                </div>
              </div>

              <div className="preview-list">
                <div className="preview-item">
                  <div className="preview-item-top">
                    <span>Customer took product</span>
                    <span className="badge badge-orange">Pay later</span>
                  </div>
                  <div className="preview-item-meta">
                    <span>
                      <Clock3 size={12} /> Due evening
                    </span>
                    <span>Rwf 45,000</span>
                  </div>
                </div>

                <div className="preview-item">
                  <div className="preview-item-top">
                    <span>Low stock warning</span>
                    <span className="badge badge-blue">3 left</span>
                  </div>
                  <div className="preview-item-meta">
                    <span>Oraimo charger</span>
                    <span>Restock soon</span>
                  </div>
                </div>

                <div className="preview-item">
                  <div className="preview-item-top">
                    <span>Problem found</span>
                    <span className="badge badge-orange">Review</span>
                  </div>
                  <div className="preview-item-meta">
                    <span>
                      <AlertTriangle size={12} /> Cash difference
                    </span>
                    <span>Owner approval needed</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="feature-section" id="features">
        <h2 className="section-title">
          Built for real electronics shop control
        </h2>

        <div className="feature-grid">
          {features.map((feature) => (
            <div className="feature-card" key={feature.title}>
              <div className="feature-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
