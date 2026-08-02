"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { Modal } from "@/components/Modal";
import { PriorityPill, PlatformBadge, StatusDot } from "@/components/Badges";
import { PLATFORM_LABELS, PLATFORMS_WITH_LIVE_INGESTION } from "@/lib/types";
import { relativeTime, initials } from "@/lib/format";
import { PlusIcon, RefreshIcon, SearchIcon } from "@/components/icons";

type Source = Tables<"sources">;
type Category = Tables<"categories">;
type ActivitySummary = { source_id: string; total_items: number; last_item_at: string | null; items_last_7_days: number };

const PLATFORM_OPTIONS = Object.entries(PLATFORM_LABELS);

export function SourcesView({
  initialSources,
  categories,
  activityBySource,
}: {
  initialSources: Source[];
  categories: Category[];
  activityBySource: Record<string, ActivitySummary>;
}) {
  const router = useRouter();
  const [sources, setSources] = useState(initialSources);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return sources.filter((s) => {
      if (platformFilter !== "all" && s.platform !== platformFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !(s.handle ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sources, platformFilter, statusFilter, query]);

  async function handleSync(sourceId: string) {
    setSyncingId(sourceId);
    try {
      const res = await fetch(`/api/sources/${sourceId}/sync`, { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        setSources((prev) =>
          prev.map((s) =>
            s.id === sourceId
              ? { ...s, last_synced_at: new Date().toISOString(), last_sync_status: "success", last_sync_error: null }
              : s
          )
        );
        router.refresh();
        if (body.itemsNew > 0) {
          alert(`Synced — found ${body.itemsNew} new item${body.itemsNew === 1 ? "" : "s"}.`);
        }
      } else {
        setSources((prev) =>
          prev.map((s) =>
            s.id === sourceId ? { ...s, last_sync_status: "error", last_sync_error: body.error } : s
          )
        );
        alert(`Sync failed: ${body.error}`);
      }
    } finally {
      setSyncingId(null);
    }
  }

  async function handleToggleStatus(source: Source) {
    const supabase = createClient();
    const next = source.status === "active" ? "paused" : "active";
    const { error } = await supabase.from("sources").update({ status: next }).eq("id", source.id);
    if (!error) {
      setSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, status: next } : s)));
    }
  }

  async function handleDelete(source: Source) {
    if (!confirm(`Remove ${source.name}? This deletes its ingested content too.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("sources").delete().eq("id", source.id);
    if (!error) {
      setSources((prev) => prev.filter((s) => s.id !== source.id));
    }
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ flex: 1, minWidth: 200 }}>
          <div className="input" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px" }}>
            <SearchIcon size={15} className="mini" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name or handle…"
              style={{ border: "none", outline: "none", background: "transparent", width: "100%" }}
            />
          </div>
        </div>
        <select className="select" style={{ width: 160 }} value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
          <option value="all">All platforms</option>
          {PLATFORM_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 140 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
        <button className="primary" onClick={() => setShowAdd(true)}>
          <PlusIcon size={15} />
          Add source
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty-state">
          <p style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>No sources yet</p>
          <p className="mini">Add an account or feed to start monitoring it.</p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Platform</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Last synced</th>
                <th>Activity (7d)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((source) => {
                const activity = activityBySource[source.id];
                const canSync = PLATFORMS_WITH_LIVE_INGESTION.has(source.platform) && source.feed_url;
                return (
                  <tr key={source.id} className="clickable" onClick={() => router.push(`/sources/${source.id}`)}>
                    <td>
                      <div className="row">
                        <div className="avatar" style={{ width: 30, height: 30, fontSize: 11.5 }}>
                          {initials(source.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{source.name}</div>
                          {source.handle && <div className="mini">{source.handle}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <PlatformBadge platform={source.platform} />
                    </td>
                    <td>
                      <PriorityPill priority={source.priority} />
                    </td>
                    <td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleStatus(source);
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        <StatusDot status={source.status} />
                      </button>
                    </td>
                    <td className="mini">
                      {source.last_synced_at ? relativeTime(source.last_synced_at) : "never"}
                      {source.last_sync_status === "error" && (
                        <span style={{ color: "var(--negative)", marginLeft: 6 }}>⚠</span>
                      )}
                    </td>
                    <td className="mini">{activity ? `${activity.items_last_7_days} items` : "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        {canSync && (
                          <button
                            className="icon-btn"
                            title="Sync now"
                            disabled={syncingId === source.id}
                            onClick={() => handleSync(source.id)}
                          >
                            <RefreshIcon size={15} className={syncingId === source.id ? "spin" : ""} />
                          </button>
                        )}
                        <button className="danger-text" onClick={() => handleDelete(source)} style={{ padding: "0 6px" }}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddSourceModal
          categories={categories}
          onClose={() => setShowAdd(false)}
          onCreated={(s) => {
            setSources((prev) => [s, ...prev]);
            setShowAdd(false);
          }}
        />
      )}
    </>
  );
}

function AddSourceModal({
  categories,
  onClose,
  onCreated,
}: {
  categories: Category[];
  onClose: () => void;
  onCreated: (s: Source) => void;
}) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<Source["platform"]>("rss");
  const [profileUrl, setProfileUrl] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsFeed = PLATFORMS_WITH_LIVE_INGESTION.has(platform);

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

    const { data, error } = await supabase
      .from("sources")
      .insert({
        user_id: user.id,
        name: name.trim(),
        handle: handle.trim() || null,
        platform: platform as Source["platform"],
        profile_url: profileUrl.trim() || null,
        feed_url: feedUrl.trim() || null,
        category_id: categoryId || null,
        priority: priority as Source["priority"],
        description: description.trim() || null,
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
    <Modal title="Add source" onClose={onClose}>
      <form onSubmit={handleSubmit} className="stack">
        <div className="grid grid-2">
          <div className="field">
            <label>Name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ben Thompson" />
          </div>
          <div className="field">
            <label>Handle</label>
            <input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@stratechery" />
          </div>
        </div>

        <div className="field">
          <label>Platform</label>
          <select className="select" value={platform} onChange={(e) => setPlatform(e.target.value as Source["platform"])}>
            {PLATFORM_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Profile URL</label>
          <input
            className="input"
            type="url"
            value={profileUrl}
            onChange={(e) => setProfileUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>

        <div className="field">
          <label>
            Feed URL {needsFeed && <span style={{ color: "var(--accent)" }}>(required for live sync)</span>}
          </label>
          <input
            className="input"
            type="url"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
          />
          <p className="mini">
            RSS/Atom URL — works for blogs, YouTube channels ({"channel_id → RSS via /feeds/videos.xml?channel_id="}),
            and most subreddits (add <code>.rss</code> to the URL). Twitter/X and LinkedIn need their paid APIs — see
            Settings.
          </p>
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

        <div className="field">
          <label>Notes (optional)</label>
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {error && <p className="mini" style={{ color: "var(--negative)" }}>{error}</p>}

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? "Adding…" : "Add source"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
