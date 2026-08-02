import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireViewer } from "@/lib/viewer";
import { ContentCard } from "@/components/ContentCard";
import { PriorityPill } from "@/components/Badges";
import { MiniBarChart } from "@/components/MiniBarChart";
import { relativeTime } from "@/lib/format";
import { AlertsIcon, DiscoveryIcon, SourcesIcon, TopicsIcon } from "@/components/icons";

export default async function DashboardPage() {
  const { supabase, email, displayName, unreadAlerts } = await requireViewer();

  const [
    { data: sources },
    { data: topics },
    { data: recentAlerts },
    { data: recentItems },
    { data: dailyActivity },
    { data: pendingSuggestions },
  ] = await Promise.all([
    supabase.from("sources").select("id, status"),
    supabase.from("topics").select("id, name, status"),
    supabase
      .from("alerts")
      .select("*")
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("content_items")
      .select("*")
      .order("fetched_at", { ascending: false })
      .limit(8),
    supabase.from("topic_daily_activity").select("*"),
    supabase.from("source_suggestions").select("id").eq("status", "new"),
  ]);

  const itemIds = (recentItems ?? []).map((i) => i.id);
  const sourceIds = [...new Set((recentItems ?? []).map((i) => i.source_id).filter((v): v is string => Boolean(v)))];
  const [{ data: analyses }, { data: sourceRows }] = await Promise.all([
    itemIds.length > 0 ? supabase.from("content_analysis").select("*").in("content_item_id", itemIds) : Promise.resolve({ data: [] }),
    sourceIds.length > 0 ? supabase.from("sources").select("id, name").in("id", sourceIds) : Promise.resolve({ data: [] }),
  ]);
  const analysisByItem = new Map((analyses ?? []).map((a) => [a.content_item_id, a]));
  const sourceNameById = new Map((sourceRows ?? []).map((s) => [s.id, s.name]));

  const activeSources = (sources ?? []).filter((s) => s.status === "active").length;
  const activeTopics = (topics ?? []).filter((t) => t.status === "active").length;

  const last7Start = new Date();
  last7Start.setDate(last7Start.getDate() - 7);
  const activityByTopic = new Map<string, number>();
  for (const row of dailyActivity ?? []) {
    if (new Date(row.day) >= last7Start) {
      activityByTopic.set(row.topic_id, (activityByTopic.get(row.topic_id) ?? 0) + row.item_count);
    }
  }

  const days: { label: string; value: number }[] = [];
  const totalsByDay = new Map<string, number>();
  for (const row of dailyActivity ?? []) {
    const key = row.day.slice(0, 10);
    totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + row.item_count);
  }
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ label: key, value: totalsByDay.get(key) ?? 0 });
  }

  const topTopics = (topics ?? [])
    .filter((t) => t.status === "active")
    .map((t) => ({ ...t, count: activityByTopic.get(t.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <AppShell email={email} displayName={displayName} unreadAlerts={unreadAlerts}>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">What&apos;s worth your attention, at a glance.</p>
          </div>
        </div>

        <div className="grid grid-4" style={{ marginBottom: 24 }}>
          <StatTile icon={<SourcesIcon size={16} />} label="Active sources" value={activeSources} total={(sources ?? []).length} href="/sources" />
          <StatTile icon={<TopicsIcon size={16} />} label="Active topics" value={activeTopics} total={(topics ?? []).length} href="/topics" />
          <StatTile icon={<AlertsIcon size={16} />} label="Unread alerts" value={unreadAlerts} href="/alerts" accent={unreadAlerts > 0} />
          <StatTile
            icon={<DiscoveryIcon size={16} />}
            label="New suggestions"
            value={(pendingSuggestions ?? []).length}
            href="/discovery"
          />
        </div>

        <div className="grid grid-2" style={{ alignItems: "flex-start", marginBottom: 24 }}>
          <div className="card card-pad">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <p className="eyebrow">Top alerts</p>
              <Link href="/alerts" className="mini">
                View all
              </Link>
            </div>
            {(recentAlerts ?? []).length === 0 ? (
              <p className="mini">No unread alerts. You&apos;re caught up.</p>
            ) : (
              <div className="stack">
                {(recentAlerts ?? []).map((alert) => (
                  <div key={alert.id} style={{ paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <PriorityPill priority={alert.priority} />
                      <span className="mini">{relativeTime(alert.created_at)}</span>
                    </div>
                    <p style={{ fontWeight: 600, fontSize: 13.5, marginTop: 6 }}>{alert.title}</p>
                    {alert.message && <p className="mini" style={{ marginTop: 2 }}>{alert.message}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card card-pad">
            <p className="eyebrow" style={{ marginBottom: 12 }}>
              Activity — last 14 days
            </p>
            <MiniBarChart data={days} height={90} />
            <div className="divider" style={{ margin: "18px 0" }} />
            <p className="eyebrow" style={{ marginBottom: 10 }}>
              Top topics this week
            </p>
            {topTopics.length === 0 ? (
              <p className="mini">No topic activity yet.</p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {topTopics.map((t) => (
                  <Link key={t.id} href={`/topics/${t.id}`} className="row" style={{ justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{t.name}</span>
                    <span className="mini">{t.count} items</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <p className="eyebrow">Recent activity</p>
        </div>
        <div className="stack">
          {(recentItems ?? []).length === 0 ? (
            <div className="card empty-state">
              <p style={{ fontWeight: 600, color: "var(--ink)" }}>No content yet</p>
              <p className="mini">Add sources and topics, then sync a source to start seeing activity here.</p>
            </div>
          ) : (
            (recentItems ?? []).map((item) => (
              <ContentCard
                key={item.id}
                item={{
                  ...item,
                  analysis: analysisByItem.get(item.id) ?? null,
                  source_name: item.source_id ? sourceNameById.get(item.source_id) : null,
                }}
              />
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}

function StatTile({
  icon,
  label,
  value,
  total,
  href,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total?: number;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link href={href} className="card card-pad">
      <div className="row mini" style={{ marginBottom: 8 }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent ? "var(--urgent)" : "var(--ink)" }}>
        {value}
        {total !== undefined && <span className="mini" style={{ fontSize: 14, fontWeight: 500 }}> / {total}</span>}
      </div>
    </Link>
  );
}
