"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { PriorityPill } from "@/components/Badges";
import { relativeTime } from "@/lib/format";
import { CheckIcon } from "@/components/icons";

type Alert = Tables<"alerts">;

export function AlertsView({
  initialAlerts,
  sourceNames,
  topicNames,
}: {
  initialAlerts: Alert[];
  sourceNames: Record<string, string>;
  topicNames: Record<string, string>;
}) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [filter, setFilter] = useState<"all" | "unread">("unread");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (filter === "unread" && a.is_read) return false;
      if (priorityFilter !== "all" && a.priority !== priorityFilter) return false;
      return true;
    });
  }, [alerts, filter, priorityFilter]);

  async function markRead(alert: Alert) {
    const supabase = createClient();
    const { error } = await supabase.from("alerts").update({ is_read: true }).eq("id", alert.id);
    if (!error) setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, is_read: true } : a)));
  }

  async function markAllRead() {
    const supabase = createClient();
    const ids = filtered.filter((a) => !a.is_read).map((a) => a.id);
    if (ids.length === 0) return;
    const { error } = await supabase.from("alerts").update({ is_read: true }).in("id", ids);
    if (!error) setAlerts((prev) => prev.map((a) => (ids.includes(a.id) ? { ...a, is_read: true } : a)));
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <select className="select" style={{ width: 140 }} value={filter} onChange={(e) => setFilter(e.target.value as "all" | "unread")}>
          <option value="unread">Unread</option>
          <option value="all">All</option>
        </select>
        <select className="select" style={{ width: 150 }} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button className="ghost" style={{ marginLeft: "auto" }} onClick={markAllRead}>
          <CheckIcon size={14} />
          Mark all read
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty-state">
          <p style={{ fontWeight: 600, color: "var(--ink)" }}>Nothing here</p>
          <p className="mini">You&apos;re all caught up.</p>
        </div>
      ) : (
        <div className="stack">
          {filtered.map((alert) => (
            <div key={alert.id} className="card card-pad" style={{ opacity: alert.is_read ? 0.65 : 1 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <PriorityPill priority={alert.priority} />
                  {alert.source_id && sourceNames[alert.source_id] && (
                    <Link href={`/sources/${alert.source_id}`} className="pill pill-outline">
                      {sourceNames[alert.source_id]}
                    </Link>
                  )}
                  {alert.topic_id && topicNames[alert.topic_id] && (
                    <Link href={`/topics/${alert.topic_id}`} className="pill pill-outline">
                      {topicNames[alert.topic_id]}
                    </Link>
                  )}
                </div>
                <span className="mini">{relativeTime(alert.created_at)}</span>
              </div>
              <p style={{ fontWeight: 700, fontSize: 14.5, marginTop: 10 }}>{alert.title}</p>
              {alert.message && <p className="mini" style={{ marginTop: 4 }}>{alert.message}</p>}
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                {!alert.is_read && (
                  <button className="ghost" style={{ padding: "5px 12px" }} onClick={() => markRead(alert)}>
                    Mark read
                  </button>
                )}
                {alert.content_item_id && (
                  <Link href={`/search?item=${alert.content_item_id}`} className="mini">
                    View content →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
