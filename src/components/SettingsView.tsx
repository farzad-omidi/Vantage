"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { DEFAULT_LANGUAGE, LANGUAGES, dirFor, languageLabel } from "@/lib/languages";

type Category = Tables<"categories">;
type AlertRule = Tables<"alert_rules">;

export function SettingsView({
  email,
  displayName,
  preferredLanguage,
  categories,
  alertRules,
  topics,
  sources,
}: {
  email: string;
  displayName: string | null;
  preferredLanguage: string;
  categories: Category[];
  alertRules: AlertRule[];
  topics: { id: string; name: string }[];
  sources: { id: string; name: string }[];
}) {
  return (
    <div className="stack" style={{ gap: 24 }}>
      <ProfileCard email={email} displayName={displayName} />
      <ReadingLanguageCard initial={preferredLanguage} />
      <CategoriesCard initialCategories={categories} />
      <AlertRulesCard initialRules={alertRules} topics={topics} sources={sources} />
      <ConnectorsCard />
    </div>
  );
}

function ProfileCard({ email, displayName }: { email: string; displayName: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ display_name: name.trim() || null }).eq("id", user.id);
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <div className="card card-pad">
      <p className="eyebrow" style={{ marginBottom: 12 }}>
        Profile
      </p>
      <form onSubmit={handleSave} className="grid grid-2" style={{ alignItems: "flex-end" }}>
        <div className="field">
          <label>Email</label>
          <input className="input" value={email} disabled />
        </div>
        <div className="field">
          <label>Display name</label>
          <div className="row">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="ghost" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// The language the analysis is WRITTEN in. Independent of what the monitored
// content is published in — Vantage reads Indonesian and answers in Persian if
// that is what you set here.
function ReadingLanguageCard({ initial }: { initial: string }) {
  const router = useRouter();
  const [language, setLanguage] = useState(initial || DEFAULT_LANGUAGE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(next: string) {
    setLanguage(next);
    setSaving(true);
    setSaved(false);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from("profiles").update({ preferred_language: next }).eq("id", user.id);
      if (!error) {
        setSaved(true);
        router.refresh();
      }
    }
    setSaving(false);
  }

  return (
    <div className="card card-pad">
      <p className="eyebrow" style={{ marginBottom: 12 }}>
        Reading language
      </p>
      <div className="grid grid-2" style={{ alignItems: "flex-start" }}>
        <div className="field">
          <label>Write analysis in</label>
          <select
            className="select"
            value={language}
            onChange={(e) => handleSave(e.target.value)}
            disabled={saving}
            dir={dirFor(language)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {languageLabel(l)}
              </option>
            ))}
          </select>
          <p className="mini">
            {saving ? "Saving…" : saved ? "Saved — applies to items analyzed from now on." : "\u00A0"}
          </p>
        </div>
        <p className="mini">
          Summaries, &ldquo;why it matters&rdquo;, opportunities and alert headlines are written in this language,
          whatever the source was published in. Titles get a translation alongside the original, so you can still
          search for what the author actually wrote. Items already analyzed keep the language they were analyzed in
          &mdash; this changes what happens next, not the archive.
        </p>
      </div>
    </div>
  );
}

function CategoriesCard({ initialCategories }: { initialCategories: Category[] }) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"source" | "topic">("source");
  const [saving, setSaving] = useState(false);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: user.id, name: name.trim(), kind })
      .select()
      .single();
    setSaving(false);
    if (!error && data) {
      setCategories((prev) => [...prev, data]);
      setName("");
      router.refresh();
    }
  }

  async function deleteCategory(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (!error) setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="card card-pad">
      <p className="eyebrow" style={{ marginBottom: 12 }}>
        Categories
      </p>
      <form onSubmit={addCategory} className="row" style={{ marginBottom: 16 }}>
        <select className="select" style={{ width: 130 }} value={kind} onChange={(e) => setKind(e.target.value as "source" | "topic")}>
          <option value="source">Source</option>
          <option value="topic">Topic</option>
        </select>
        <input
          className="input"
          placeholder="Category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, maxWidth: 240 }}
        />
        <button className="primary" disabled={saving}>
          Add
        </button>
      </form>
      {categories.length === 0 ? (
        <p className="mini">No categories yet — add one above to organize sources and topics.</p>
      ) : (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {categories.map((c) => (
            <span key={c.id} className="pill pill-outline row" style={{ gap: 6 }}>
              {c.kind}: {c.name}
              <button
                onClick={() => deleteCategory(c.id)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--faint)" }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRulesCard({
  initialRules,
  topics,
  sources,
}: {
  initialRules: AlertRule[];
  topics: { id: string; name: string }[];
  sources: { id: string; name: string }[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [name, setName] = useState("");
  const [topicId, setTopicId] = useState("");
  const [minPriority, setMinPriority] = useState("medium");
  const [saving, setSaving] = useState(false);

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("alert_rules")
      .insert({
        user_id: user.id,
        name: name.trim(),
        topic_id: topicId || null,
        min_priority: minPriority as AlertRule["min_priority"],
      })
      .select()
      .single();
    setSaving(false);
    if (!error && data) {
      setRules((prev) => [data, ...prev]);
      setName("");
    }
  }

  async function toggleRule(rule: AlertRule) {
    const supabase = createClient();
    const { error } = await supabase.from("alert_rules").update({ active: !rule.active }).eq("id", rule.id);
    if (!error) setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r)));
  }

  async function deleteRule(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("alert_rules").delete().eq("id", id);
    if (!error) setRules((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="card card-pad">
      <p className="eyebrow" style={{ marginBottom: 4 }}>
        Alert rules
      </p>
      <p className="mini" style={{ marginBottom: 12 }}>
        Without any rules, Vantage alerts you on every high or urgent finding by default. Add rules to scope alerts to
        specific topics or raise the bar.
      </p>
      <form onSubmit={addRule} className="grid grid-3" style={{ marginBottom: 16, alignItems: "flex-end" }}>
        <div className="field">
          <label>Rule name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Competitor mentions" />
        </div>
        <div className="field">
          <label>Topic (optional)</label>
          <select className="select" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">Any topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Minimum priority</label>
          <div className="row">
            <select className="select" value={minPriority} onChange={(e) => setMinPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <button className="primary" disabled={saving}>
              Add
            </button>
          </div>
        </div>
      </form>
      {rules.length === 0 ? (
        <p className="mini">No custom rules — using the default (alert on high/urgent).</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {rules.map((rule) => (
            <div key={rule.id} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{rule.name}</span>
                <span className="mini" style={{ marginLeft: 8 }}>
                  min priority: {rule.min_priority}
                  {rule.topic_id && ` · ${topics.find((t) => t.id === rule.topic_id)?.name ?? "topic"}`}
                </span>
              </div>
              <div className="row">
                <button className="ghost" style={{ padding: "4px 10px" }} onClick={() => toggleRule(rule)}>
                  {rule.active ? "Disable" : "Enable"}
                </button>
                <button className="danger-text" onClick={() => deleteRule(rule.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {sources.length === 0 && null}
    </div>
  );
}

function ConnectorsCard() {
  return (
    <div className="card card-pad">
      <p className="eyebrow" style={{ marginBottom: 12 }}>
        Data connectors
      </p>
      <div className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: 13.5 }}>RSS / Atom feeds (blogs, YouTube, subreddits, news)</span>
          <span className="pill pill-positive">Live</span>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: 13.5 }}>X / Twitter, LinkedIn</span>
          <span className="pill pill-outline">Needs paid API credentials</span>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: 13.5 }}>AI analysis &amp; discovery (Anthropic)</span>
          <span className="pill pill-positive">Live</span>
        </div>
      </div>
      <p className="mini" style={{ marginTop: 12 }}>
        See the README for how to wire up scheduled ingestion (cron) and add paid-API connectors.
      </p>
    </div>
  );
}
