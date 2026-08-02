"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import type { Tables } from "@/lib/database.types";
import { Modal } from "@/components/Modal";
import { PriorityPill, StatusDot } from "@/components/Badges";
import { PlusIcon } from "@/components/icons";

type Topic = Tables<"topics">;
type Category = Tables<"categories">;

export function TopicsView({
  initialTopics,
  categories,
  matchCounts,
}: {
  initialTopics: Topic[];
  categories: Category[];
  matchCounts: Record<string, number>;
}) {
  const [topics, setTopics] = useState(initialTopics);
  const [showAdd, setShowAdd] = useState(false);

  async function handleToggleStatus(topic: Topic) {
    const supabase = createClient();
    const next = topic.status === "active" ? "paused" : "active";
    const { error } = await supabase.from("topics").update({ status: next }).eq("id", topic.id);
    if (!error) setTopics((prev) => prev.map((t) => (t.id === topic.id ? { ...t, status: next } : t)));
  }

  async function handleDelete(topic: Topic) {
    if (!confirm(`Delete topic "${topic.name}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("topics").delete().eq("id", topic.id);
    if (!error) setTopics((prev) => prev.filter((t) => t.id !== topic.id));
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 16 }}>
        <button className="primary" onClick={() => setShowAdd(true)}>
          <PlusIcon size={15} />
          Add topic
        </button>
      </div>

      {topics.length === 0 ? (
        <div className="card empty-state">
          <p style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>No topics yet</p>
          <p className="mini">Define a topic — a product name, a market, a competitor — and Vantage will watch for it.</p>
        </div>
      ) : (
        <div className="grid grid-2">
          {topics.map((topic) => (
            <div key={topic.id} className="card card-pad">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <Link href={`/topics/${topic.id}`} style={{ fontWeight: 700, fontSize: 15 }}>
                    {topic.name}
                  </Link>
                  <div className="row" style={{ marginTop: 4 }}>
                    <PriorityPill priority={topic.priority} />
                    <button
                      onClick={() => handleToggleStatus(topic)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      <StatusDot status={topic.status} />
                    </button>
                  </div>
                </div>
                <span className="mini">{matchCounts[topic.id] ?? 0} matches</span>
              </div>
              {topic.description && <p className="mini" style={{ marginTop: 10 }}>{topic.description}</p>}
              {topic.keywords.length > 0 && (
                <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                  {topic.keywords.map((kw) => (
                    <span key={kw} className="pill pill-outline">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                <button className="danger-text" onClick={() => handleDelete(topic)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddTopicModal
          categories={categories}
          onClose={() => setShowAdd(false)}
          onCreated={(t) => {
            setTopics((prev) => [t, ...prev]);
            setShowAdd(false);
          }}
        />
      )}
    </>
  );
}

function AddTopicModal({
  categories,
  onClose,
  onCreated,
}: {
  categories: Category[];
  onClose: () => void;
  onCreated: (t: Topic) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [language, setLanguage] = useState("en");
  const [region, setRegion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const keywords = keywordsText
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const { data, error } = await supabase
      .from("topics")
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        keywords,
        category_id: categoryId || null,
        priority: priority as Topic["priority"],
        language,
        region: region.trim() || null,
      })
      .select()
      .single();

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onCreated(data);
  }

  return (
    <Modal title="Add topic" onClose={onClose}>
      <form onSubmit={handleSubmit} className="stack">
        <div className="field">
          <label>Name</label>
          <input
            className="input"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. AI coding assistants"
          />
        </div>
        <div className="field">
          <label>Keywords &amp; phrases (comma-separated)</label>
          <textarea
            className="textarea"
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            placeholder="copilot, cursor, AI pair programming, code completion"
          />
          <p className="mini">
            Seeds keyword matching during ingestion; the AI analysis pass then judges true relevance beyond string
            matches.
          </p>
        </div>
        <div className="field">
          <label>Description (optional — sharpens AI relevance judgments)</label>
          <textarea
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What counts as relevant here? What should be ignored?"
          />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label>Category</label>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Priority</label>
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label>Language</label>
            <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {languageLabel(l)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Region (optional)</label>
            <input className="input" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. US, EU, global" />
          </div>
        </div>

        {error && <p className="mini" style={{ color: "var(--negative)" }}>{error}</p>}

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? "Adding…" : "Add topic"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
