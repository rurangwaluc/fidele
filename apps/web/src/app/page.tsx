import {
  AlertTriangle,
  ArrowRight,
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
  WalletCards,
} from "lucide-react";

import { ThemeToggle } from "@/components/ui/ThemeToggle";
import styles from "./page.module.css";

const features = [
  {
    icon: <Boxes size={20} />,
    title: "Know your stock",
    text: "See what is available, low, damaged, missing, or needs restocking.",
  },
  {
    icon: <ShoppingCart size={20} />,
    title: "Track every sale",
    text: "Record paid now, pay later, installments, and customer sales clearly.",
  },
  {
    icon: <Banknote size={20} />,
    title: "Control money",
    text: "Track cash, MoMo, bank payments, expenses, and daily closing.",
  },
  {
    icon: <ShieldCheck size={20} />,
    title: "Control staff actions",
    text: "Know who sold, who received money, who changed stock, and when.",
  },
];

const simpleSteps = [
  "Open cash",
  "Sell product",
  "Record payment",
  "Check problems",
];

export default function LandingPage() {
  return (
    <main className={`${styles.page} page-shell`}>
      <header className={styles.header}>
        <a className="brand" href="/">
          <span className="brand-icon">E</span>
          <span className={styles.brandText}>ElectroControl</span>
        </a>

        <div className={styles.headerActions}>
          <ThemeToggle />

          <a href="/login" className={`${styles.hideOnSmall} btn btn-outline`}>
            Login
          </a>

          <a href="/login" className={`${styles.openButton} btn btn-primary`}>
            <span>Open System</span>
            <ArrowRight size={14} />
          </a>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className="hero-kicker">
            <CheckCircle2 size={15} />
            One-shop electronics business control system
          </div>

          <h1 className={styles.heroTitle}>
            Control stock, sales, debts, cash, and staff from{" "}
            <span>one simple place.</span>
          </h1>

          <p className={styles.heroText}>
            Built for a real electronics shop where the owner needs to know what
            entered, what sold, who sold it, who owes money, where money went,
            and what every employee did.
          </p>

          <div className={styles.heroActions}>
            <a href="/login" className="btn btn-primary">
              Start with Login
              <ArrowRight size={14} />
            </a>

            <a href="#features" className="btn btn-outline">
              View Features
            </a>
          </div>

          <div className={styles.trustStrip}>
            <div>
              <strong>Simple</strong>
              <span>For non-technical users</span>
            </div>

            <div>
              <strong>Owner-first</strong>
              <span>Clear control and proof</span>
            </div>

            <div>
              <strong>Daily use</strong>
              <span>Sales, cash, debts, stock</span>
            </div>
          </div>

          <div className={styles.statsRow}>
            <div className="stat-card">
              <div className="stat-label">Main users</div>
              <div className="stat-value">1 owner + staff</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Currency</div>
              <div className="stat-value">Rwf</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Purpose</div>
              <div className="stat-value">Full control</div>
            </div>
          </div>
        </div>

        <div className={styles.previewCard}>
          <div className={styles.previewHeader}>
            <div>
              <span className="preview-dot" />
              <strong>Shop Dashboard Preview</strong>
            </div>

            <span className="badge badge-green">Open</span>
          </div>

          <div className={styles.previewGrid}>
            <aside className={styles.previewSidebar}>
              <div className={styles.previewMenu}>
                <div className={styles.activeMenuItem}>
                  <LayoutDashboard size={15} />
                  <span>Dashboard</span>
                </div>

                <div>
                  <ShoppingCart size={15} />
                  <span>Sales</span>
                </div>

                <div>
                  <Package size={15} />
                  <span>Stock</span>
                </div>

                <div>
                  <Users size={15} />
                  <span>Customers</span>
                </div>

                <div>
                  <ReceiptText size={15} />
                  <span>Money</span>
                </div>
              </div>
            </aside>

            <section className={styles.previewContent}>
              <div className={styles.previewTop}>
                <div>
                  <div className={styles.previewTitle}>Today in the shop</div>
                  <div className={styles.previewSubtitle}>Kigali main shop</div>
                </div>

                <span className="badge badge-green">Safe</span>
              </div>

              <div className={styles.previewStats}>
                <div className="stat-card">
                  <div className="stat-label">Sales</div>
                  <div className="stat-value">Rwf 850k</div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">Customer debts</div>
                  <div className="stat-value">Rwf 120k</div>
                </div>
              </div>

              <div className={styles.previewList}>
                <div className={styles.previewItem}>
                  <div className={styles.previewItemTop}>
                    <span>Customer took product</span>
                    <span className="badge badge-orange">Pay later</span>
                  </div>

                  <div className={styles.previewItemMeta}>
                    <span>
                      <Clock3 size={12} /> Due evening
                    </span>
                    <span>Rwf 45,000</span>
                  </div>
                </div>

                <div className={styles.previewItem}>
                  <div className={styles.previewItemTop}>
                    <span>Low stock warning</span>
                    <span className="badge badge-blue">3 left</span>
                  </div>

                  <div className={styles.previewItemMeta}>
                    <span>Oraimo charger</span>
                    <span>Restock soon</span>
                  </div>
                </div>

                <div className={styles.previewItem}>
                  <div className={styles.previewItemTop}>
                    <span>Owner attention needed</span>
                    <span className="badge badge-orange">Review</span>
                  </div>

                  <div className={styles.previewItemMeta}>
                    <span>
                      <AlertTriangle size={12} /> Cash difference
                    </span>
                    <span>Check before closing</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className={styles.flowSection}>
        <div className={styles.flowPanel}>
          <div className={styles.flowCopy}>
            <span className="hero-kicker dashboard-kicker">
              <WalletCards size={15} />
              Daily shop flow
            </span>

            <h2 className={styles.sectionTitle}>
              Easy steps for everyday work
            </h2>

            <p className={styles.flowText}>
              A simple daily path for non-technical users: open cash, sell,
              receive money, and check what needs attention.
            </p>
          </div>

          <div className={styles.flowGrid}>
            {simpleSteps.map((step, index) => (
              <div className={styles.flowCard} key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.featureSection} id="features">
        <div className={styles.sectionHeadingRow}>
          <div>
            <span className="hero-kicker dashboard-kicker">
              <ShieldCheck size={15} />
              Built for control
            </span>

            <h2 className={styles.sectionTitle}>
              Everything the owner needs to see clearly
            </h2>
          </div>

          <a href="/login" className="btn btn-outline">
            Open System
          </a>
        </div>

        <div className={styles.featureGrid}>
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
