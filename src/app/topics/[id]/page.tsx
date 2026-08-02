import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireViewer } from "@/lib/viewer";
import { ContentCard } from "@/components/ContentCard";
import { MiniBarChart } from "@/components/MiniBarChart";
import { PriorityPill, StatusDot } from "@/components/Badges";

export default async function TopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, email, displayName, unreadAlerts } = await requireViewer();

  const { data: topic } = await supabase.from("topics").select("*").eq("id", id).eq("user_id", user.id).single();
  if (!topic) notFound();

  const { data: matches } = await supabase
    .from("content_topic_matches")
    .select("content_item_id")
    .eq("topic_id", id);
  const itemIds = (matches ?? []).map((m) => m.content_item_id);

  const [{ data: items }, { data: dailyActivity }] = await Promise.all([
    itemIds.length > 0
      ? supabase
          .from("content_items")
          .select("*")
          .in("id", itemIds)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    supabase.from("topic_daily_activity").select("*").eq("topic_id", id),
  ]);

  const analysisIds = (items ?? []).map((i) => i.id);
  const sourceIds = [...new Set((items ?? []).map((i) => i.source_id).filter((v): v is string => Boolean(v)))];
  const [{ data: analyses }, { data: sourceRows }] = await Promise.all([
    analysisIds.length > 0
      ? supabase.from("content_analysis").select("*").in("content_item_id", analysisIds)
      : Promise.resolve({ data: [] }),
    sourceIds.length > 0 ? supabase.from("sources").select("id, name").in("id", sourceIds) : Promise.resolve({ data: [] }),
  ]);
  const analysisByItem = new Map((analyses ?? []).map((a) => [a.content_item_id, a]));
  const sourceNameById = new Map((sourceRows ?? []).map((s) => [s.id, s.name]));

  const days: { label: string; value: number }[] = [];
  const activityByDay = new Map((dailyActivity ?? []).map((d) => [d.day.slice(0, 10), d.item_count]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ label: key, value: activityByDay.get(key) ?? 0 });
  }

  return (
    <AppShell email={email} displayName={displayName} unreadAlerts={unreadAlerts}>
      <div className="page">
        <Link href="/topics" className="mini" style={{ display: "inline-block", marginBottom: 14 }}>
          ← All topics
        </Link>

        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <div className="row">
              <h1 className="page-title">{topic.name}</h1>
              <StatusDot status={topic.status} />
            </div>
            {topic.description && <p className="page-subtitle">{topic.description}</p>}
            <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
              <PriorityPill priority={topic.priority} />
              {topic.keywords.map((kw: string) => (
                <span key={kw} className="pill pill-outline">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="card card-pad" style={{ marginBottom: 24 }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>
            Activity — last 30 days
          </p>
          <MiniBarChart data={days} height={80} />
        </div>

        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Matched content ({items?.length ?? 0})
        </p>
        <div className="stack">
          {(items ?? []).length === 0 ? (
            <div className="card empty-state">
              <p style={{ fontWeight: 600, color: "var(--ink)" }}>No matches yet</p>
              <p className="mini">Content is matched against this topic&apos;s keywords during ingestion and analysis.</p>
            </div>
          ) : (
            (items ?? []).map((item) => (
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
