"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { PlatformBadge } from "@/components/Badges";
import { relativeTime } from "@/lib/format";
import { CheckIcon, ExternalLinkIcon, SparkleIcon, XIcon } from "@/components/icons";

type Suggestion = Tables<"source_suggestions">;

export function DiscoveryView({ initialSuggestions }: { initialSuggestions: Suggestion[] }) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = suggestions.filter((s) => s.status === "new");
  const resolved = suggestions.filter((s) => s.status !== "new");

  async function handleRun() {
    setRunning(true);
    try {
      const res = await fetch("/api/discovery/run", { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        router.refresh();
        if (body.suggestionsFound > 0) {
          const { data } = await createClient()
            .from("source_suggestions")
            .select("*")
            .eq("status", "new")
            .order("discovered_at", { ascending: false });
          if (data) setSuggestions((prev) => mergeUnique(data, prev));
        } else {
          alert("No new suggestions found this run — try again after adding more topics.");
        }
      } else {
        alert(`Discovery failed: ${body.error}`);
      }
    } finally {
      setRunning(false);
    }
  }

  async function handleApprove(suggestion: Suggestion) {
    setBusyId(suggestion.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("approve_source_suggestion", { p_suggestion_id: suggestion.id });
    setBusyId(null);
    if (!error) {
      setSuggestions((prev) => prev.map((s) => (s.id === suggestion.id ? { ...s, status: "approved" } : s)));
    }
  }

  async function handleDismiss(suggestion: Suggestion) {
    setBusyId(suggestion.id);
    const supabase = createClient();
    const { error } = await supabase.from("source_suggestions").update({ status: "dismissed" }).eq("id", suggestion.id);
    setBusyId(null);
    if (!error) {
      setSuggestions((prev) => prev.map((s) => (s.id === suggestion.id ? { ...s, status: "dismissed" } : s)));
    }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 16 }}>
        <button className="primary" onClick={handleRun} disabled={running}>
          <SparkleIcon size={15} />
          {running ? "Searching…" : "Run discovery"}
        </button>
      </div>

      {pending.length === 0 ? (
        <div className="card empty-state">
          <p style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>No pending suggestions</p>
          <p className="mini">
            Run discovery to have Vantage search the web for accounts and publications worth monitoring, based on
            your active topics.
          </p>
        </div>
      ) : (
        <div className="grid grid-2">
          {pending.map((s) => (
            <div key={s.id} className="card card-pad">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{s.name}</div>
                  {s.handle && <div className="mini">{s.handle}</div>}
                </div>
                <PlatformBadge platform={s.platform} />
              </div>
              {s.reason && <p className="mini" style={{ marginTop: 10 }}>{s.reason}</p>}
              <div className="row" style={{ justifyContent: "space-between", marginTop: 14 }}>
                <div className="row">
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer" className="mini row" style={{ gap: 3 }}>
                      Visit <ExternalLinkIcon size={12} />
                    </a>
                  )}
                  <span className="mini">{relativeTime(s.discovered_at)}</span>
                </div>
                <div className="row">
                  <button className="icon-btn" disabled={busyId === s.id} onClick={() => handleDismiss(s)} title="Dismiss">
                    <XIcon size={15} />
                  </button>
                  <button
                    className="ghost"
                    disabled={busyId === s.id}
                    onClick={() => handleApprove(s)}
                    style={{ padding: "6px 12px" }}
                  >
                    <CheckIcon size={14} />
                    Add source
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <>
          <p className="eyebrow" style={{ margin: "28px 0 12px" }}>
            Resolved
          </p>
          <div className="stack">
            {resolved.map((s) => (
              <div key={s.id} className="card card-pad row" style={{ justifyContent: "space-between", opacity: 0.7 }}>
                <div className="row">
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <PlatformBadge platform={s.platform} />
                </div>
                <span className="pill pill-outline">{s.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function mergeUnique(fresh: Suggestion[], prev: Suggestion[]): Suggestion[] {
  const ids = new Set(prev.map((p) => p.id));
  return [...fresh.filter((f) => !ids.has(f.id)), ...prev];
}
