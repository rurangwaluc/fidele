"use client";

import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { FormEvent, useState } from "react";
import { loginUser, saveToken } from "@/lib/auth";

import { AsyncButton } from "@/components/ui/AsyncButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("fidele@elc.com");
  const [password, setPassword] = useState("Elc@12345");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await loginUser(email, password);
      saveToken(result.token);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card premium-auth-card">
        <div className="auth-card-header">
          <div className="auth-top-row">
            <a className="brand" href="/">
              <span className="brand-icon">E</span>
              <span>ElectroControl</span>
            </a>
            <ThemeToggle />
          </div>

          <div className="auth-icon-box">
            <LockKeyhole size={22} />
          </div>

          <h1 className="auth-title">Login to your shop</h1>
          <p className="auth-subtitle">
            Control stock, sales, customer debts, money, and staff actions from
            one place.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error ? <div className="form-error">{error}</div> : null}

          <div className="form-group">
            <label className="form-label">Email address</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="owner@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>

            <div className="password-field">
              <input
                className="form-input password-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <AsyncButton
            loading={loading}
            type="submit"
            style={{ width: "100%", marginTop: 8 }}
          >
            <LockKeyhole size={15} />
            Login
          </AsyncButton>
        </form>
      </div>
    </main>
  );
}
