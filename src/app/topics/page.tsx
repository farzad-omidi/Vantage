import { AppShell } from "@/components/AppShell";
import { requireViewer } from "@/lib/viewer";
import { TopicsView } from "@/components/TopicsView";

export default async function TopicsPage() {
  const { supabase, user, email, displayName, unreadAlerts } = await requireViewer();

  const [{ data: topics }, { data: categories }, { data: matchCounts }] = await Promise.all([
    supabase.from("topics").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("categories").select("*").eq("user_id", user.id).eq("kind", "topic").order("sort_order"),
    supabase.from("content_topic_matches").select("topic_id"),
  ]);

  const counts: Record<string, number> = {};
  for (const m of matchCounts ?? []) {
    counts[m.topic_id] = (counts[m.topic_id] ?? 0) + 1;
  }

  return (
    <AppShell email={email} displayName={displayName} unreadAlerts={unreadAlerts}>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Topics</h1>
            <p className="page-subtitle">Keywords and areas of interest — Vantage understands context, not just string matches.</p>
          </div>
        </div>
        <TopicsView initialTopics={topics ?? []} categories={categories ?? []} matchCounts={counts} />
      </div>
    </AppShell>
  );
}
