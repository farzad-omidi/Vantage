"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const linkError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setStatus("error");
      const message = error.message?.trim();
      setError(message && message !== "{}" ? message : "Couldn't send that link — try again.");
      return;
    }
    setStatus("sent");
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
            AI-powered social & market intelligence
          </p>
        </div>

        <div className="card card-pad">
          {status === "sent" ? (
            <div className="stack">
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Check your email</h2>
                <p className="mini">
                  We sent a sign-in link to <strong style={{ color: "var(--ink)" }}>{email}</strong>. Open it on
                  this device to continue.
                </p>
              </div>
              <button className="ghost" onClick={() => setStatus("idle")}>
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Sign in</h2>
                <p className="mini">No password — we&apos;ll email you a secure link.</p>
              </div>
              {linkError && (
                <p className="mini" style={{ color: "var(--negative)", marginBottom: 12 }}>
                  That link expired or was already used. Request a new one below.
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
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {error && (
                  <p className="mini" style={{ color: "var(--negative)" }}>
                    {error}
                  </p>
                )}
                <button className="primary" type="submit" disabled={status === "sending"} style={{ justifyContent: "center" }}>
                  {status === "sending" ? "Sending…" : "Send sign-in link"}
                </button>
              </form>
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
