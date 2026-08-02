"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { PriorityPill, PlatformBadge, StatusDot } from "@/components/Badges";
import { ContentCard } from "@/components/ContentCard";
import { PLATFORMS_WITH_LIVE_INGESTION } from "@/lib/types";
import { formatDateTime, initials } from "@/lib/format";
import { ExternalLinkIcon, RefreshIcon } from "@/components/icons";

type Source = Tables<"sources">;
type Category = Tables<"categories">;
type Note = Tables<"source_notes">;
type Interaction = Tables<"source_interactions">;
type ContentItem = Tables<"content_items"> & { analysis: Tables<"content_analysis"> | null };

const RELATIONSHIP_STAGES = ["new", "watching", "engaged", "partner"] as const;
const INTERACTION_KINDS = ["viewed", "contacted", "replied", "meeting", "collaboration", "other"] as const;

export function SourceDetailView({
  source: initialSource,
  items,
  notes: initialNotes,
  interactions: initialInteractions,
  categories,
}: {
  source: Source;
  items: ContentItem[];
  notes: Note[];
  interactions: Interaction[];
  categories: Category[];
}) {
  const router = useRouter();
  const [source, setSource] = useState(initialSource);
  const [tab, setTab] = useState<"activity" | "notes" | "interactions">("activity");
  const [syncing, setSyncing] = useState(false);
  const canSync = PLATFORMS_WITH_LIVE_INGESTION.has(source.platform) && source.feed_url;

  async function updateSource(patch: Partial<Source>) {
    const supabase = createClient();
    const { error } = await supabase.from("sources").update(patch).eq("id", source.id);
    if (!error) setSource((s) => ({ ...s, ...patch }));
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/sources/${source.id}/sync`, { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        router.refresh();
        alert(`Synced — found ${body.itemsNew} new item${body.itemsNew === 1 ? "" : "s"}.`);
      } else {
        alert(`Sync failed: ${body.error}`);
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <Link href="/sources" className="mini row" style={{ marginBottom: 14, display: "inline-flex" }}>
        ← All sources
      </Link>

      <div className="row" style={{ alignItems: "flex-start", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>
          {initials(source.name)}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <h1 className="page-title">{source.name}</h1>
            <StatusDot status={source.status} />
          </div>
          <div className="row mini" style={{ marginTop: 4, flexWrap: "wrap" }}>
            {source.handle && <span>{source.handle}</span>}
            <PlatformBadge platform={source.platform} />
            <PriorityPill priority={source.priority} />
            {source.profile_url && (
              <a href={source.profile_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 3 }}>
                Visit <ExternalLinkIcon size={12} />
              </a>
            )}
          </div>
          {source.description && <p className="mini" style={{ marginTop: 8, maxWidth: 560 }}>{source.description}</p>}
        </div>
        <div className="row">
          {canSync && (
            <button className="ghost" onClick={handleSync} disabled={syncing}>
              <RefreshIcon size={15} />
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
          <button className="ghost" onClick={() => updateSource({ is_saved: !source.is_saved })}>
            {source.is_saved ? "★ Saved" : "☆ Save"}
          </button>
          <button
            className="ghost"
            onClick={() => updateSource({ status: source.status === "active" ? "paused" : "active" })}
          >
            {source.status === "active" ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <div className="card card-pad">
          <label className="mini" style={{ fontWeight: 600 }}>
            Priority
          </label>
          <select
            className="select"
            style={{ marginTop: 6 }}
            value={source.priority}
            onChange={(e) => updateSource({ priority: e.target.value as Source["priority"] })}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="card card-pad">
          <label className="mini" style={{ fontWeight: 600 }}>
            Category
          </label>
          <select
            className="select"
            style={{ marginTop: 6 }}
            value={source.category_id ?? ""}
            onChange={(e) => updateSource({ category_id: e.target.value || null })}
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="card card-pad">
          <label className="mini" style={{ fontWeight: 600 }}>
            Relationship stage
          </label>
          <select
            className="select"
            style={{ marginTop: 6 }}
            value={source.relationship_stage}
            onChange={(e) => updateSource({ relationship_stage: e.target.value as Source["relationship_stage"] })}
          >
            {RELATIONSHIP_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage[0].toUpperCase() + stage.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row" style={{ borderBottom: "1px solid var(--line)", marginBottom: 20, gap: 4 }}>
        {(["activity", "notes", "interactions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              padding: "10px 4px",
              marginRight: 20,
              fontWeight: 600,
              fontSize: 13.5,
              color: tab === t ? "var(--ink)" : "var(--muted)",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {t}
            {t === "activity" && ` (${items.length})`}
          </button>
        ))}
      </div>

      {tab === "activity" && (
        <div className="stack">
          {items.length === 0 ? (
            <div className="card empty-state">
              <p style={{ fontWeight: 600, color: "var(--ink)" }}>No content ingested yet</p>
              <p className="mini">
                {canSync ? "Click \"Sync now\" above to pull the latest items." : "This platform needs a feed URL to sync automatically — add one from the source list, or log items manually via notes."}
              </p>
            </div>
          ) : (
            items.map((item) => <ContentCard key={item.id} item={item} />)
          )}
        </div>
      )}

      {tab === "notes" && <NotesTab sourceId={source.id} initialNotes={initialNotes} />}
      {tab === "interactions" && <InteractionsTab sourceId={source.id} initialInteractions={initialInteractions} />}
    </>
  );
}

function NotesTab({ sourceId, initialNotes }: { sourceId: string; initialNotes: Note[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("source_notes")
      .insert({ user_id: user.id, source_id: sourceId, note: text.trim() })
      .select()
      .single();
    setSaving(false);
    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setText("");
    }
  }

  async function deleteNote(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("source_notes").delete().eq("id", id);
    if (!error) setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="stack">
      <form onSubmit={addNote} className="card card-pad stack">
        <textarea
          className="textarea"
          placeholder="Add a note about this source…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="primary" disabled={saving || !text.trim()}>
            {saving ? "Saving…" : "Add note"}
          </button>
        </div>
      </form>
      {notes.length === 0 ? (
        <p className="mini">No notes yet.</p>
      ) : (
        notes.map((note) => (
          <div key={note.id} className="card card-pad">
            <p style={{ whiteSpace: "pre-wrap" }}>{note.note}</p>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
              <span className="mini">{formatDateTime(note.created_at)}</span>
              <button className="danger-text" onClick={() => deleteNote(note.id)}>
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function InteractionsTab({ sourceId, initialInteractions }: { sourceId: string; initialInteractions: Interaction[] }) {
  const [interactions, setInteractions] = useState(initialInteractions);
  const [kind, setKind] = useState<(typeof INTERACTION_KINDS)[number]>("viewed");
  const [notesText, setNotesText] = useState("");
  const [saving, setSaving] = useState(false);

  async function addInteraction(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("source_interactions")
      .insert({ user_id: user.id, source_id: sourceId, kind, notes: notesText.trim() || null })
      .select()
      .single();
    setSaving(false);
    if (!error && data) {
      setInteractions((prev) => [data, ...prev]);
      setNotesText("");
    }
  }

  return (
    <div className="stack">
      <form onSubmit={addInteraction} className="card card-pad stack">
        <div className="grid grid-2">
          <div className="field">
            <label>Type</label>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {INTERACTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <textarea
          className="textarea"
          placeholder="Details (optional)…"
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
        />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="primary" disabled={saving}>
            {saving ? "Logging…" : "Log interaction"}
          </button>
        </div>
      </form>
      {interactions.length === 0 ? (
        <p className="mini">No interactions logged yet.</p>
      ) : (
        interactions.map((interaction) => (
          <div key={interaction.id} className="card card-pad row" style={{ justifyContent: "space-between" }}>
            <div>
              <span className="pill pill-outline" style={{ textTransform: "capitalize" }}>
                {interaction.kind}
              </span>
              {interaction.notes && <p className="mini" style={{ marginTop: 6 }}>{interaction.notes}</p>}
            </div>
            <span className="mini">{formatDateTime(interaction.occurred_at)}</span>
          </div>
        ))
      )}
    </div>
  );
}
