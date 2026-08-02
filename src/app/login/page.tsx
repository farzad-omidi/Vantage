"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

type Mode = "signin" | "signup";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const linkError = searchParams.get("error");

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setBusy(false);
      if (error) {
        setError(
          error.message === "Invalid login credentials"
            ? "Email or password is wrong. If this account was originally created with a sign-in link, it has no password yet — set one under Authentication → Users in Supabase, or sign up with a different email."
            : error.message || "Couldn't sign in — check your email and password."
        );
        return;
      }
      router.push(next);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setError(error.message || "Couldn't create that account.");
      return;
    }

    // Supabase deliberately doesn't reveal that an email is already registered: it
    // answers 200 with a stub user carrying an empty `identities` array and creates
    // nothing. Detect that, or we'd show a "check your email" panel for a
    // confirmation that is never going to arrive.
    if (data.user?.identities?.length === 0) {
      setMode("signin");
      setError(
        "An account with that email already exists. Sign in with its password below — or, if it was created with a sign-in link and has no password yet, set one under Authentication → Users in Supabase."
      );
      return;
    }

    // With "Confirm email" turned off in Supabase (Authentication → Providers →
    // Email), signUp returns a live session and we go straight in. With it on,
    // there's no session yet and the user has to click the emailed link once.
    if (data.session) {
      router.push(next);
      router.refresh();
      return;
    }
    setConfirmSent(true);
  }

  return (
    <div className="center-screen">
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            className="sidebar-mark"
            style={{ margin: "0 auto 14px", width: 40, height: 40, borderRadius: 10, fontSize: 18 }}
          >
            V
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>Vantage</h1>
          <p className="mini" style={{ marginTop: 4 }}>
            AI-powered social &amp; market intelligence
          </p>
        </div>

        <div className="card card-pad">
          {confirmSent ? (
            <div className="stack">
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Confirm your email</h2>
                <p className="mini">
                  This project still has email confirmation switched on, so we sent a one-time link to{" "}
                  <strong style={{ color: "var(--ink)" }}>{email}</strong>. Click it once and you can sign in with
                  your password from then on.
                </p>
              </div>
              <button className="ghost" onClick={() => { setConfirmSent(false); setMode("signin"); }}>
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                  {mode === "signin" ? "Sign in" : "Create an account"}
                </h2>
                <p className="mini">
                  {mode === "signin"
                    ? "Email and password — no waiting on a link."
                    : "Pick a password of at least 6 characters."}
                </p>
              </div>

              {linkError && (
                <p className="mini" style={{ color: "var(--negative)", marginBottom: 12 }}>
                  That link expired or was already used. Sign in with your password below.
                </p>
              )}

              <form onSubmit={handleSubmit} className="stack">
                <div className="field">
                  <label>Email</label>
                  <input
                    className="input"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input
                    className="input"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="mini" style={{ color: "var(--negative)" }}>
                    {error}
                  </p>
                )}

                <button className="primary" type="submit" disabled={busy} style={{ justifyContent: "center" }}>
                  {busy
                    ? mode === "signin"
                      ? "Signing in…"
                      : "Creating account…"
                    : mode === "signin"
                      ? "Sign in"
                      : "Create account"}
                </button>
              </form>

              <p className="mini" style={{ textAlign: "center", marginTop: 14 }}>
                {mode === "signin" ? "No account yet? " : "Already have an account? "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setError(null);
                  }}
                >
                  {mode === "signin" ? "Create one" : "Sign in"}
                </button>
              </p>
            </>
          )}
        </div>

        <p className="mini" style={{ textAlign: "center", marginTop: 20 }}>
          Monitor what matters. Miss nothing that does.
        </p>
      </div>
    </div>
  );
}
