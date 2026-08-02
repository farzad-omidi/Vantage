import { AppShell } from "@/components/AppShell";
import { requireViewer } from "@/lib/viewer";
import { SourcesView } from "@/components/SourcesView";

export default async function SourcesPage() {
  const { supabase, user, email, displayName, unreadAlerts } = await requireViewer();

  const [{ data: sources }, { data: categories }, { data: activity }] = await Promise.all([
    supabase.from("sources").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase
      .from("categories")
      .select("*")
      .eq("user_id", user.id)
      .eq("kind", "source")
      .order("sort_order"),
    supabase.from("source_activity_summary").select("*"),
  ]);

  const activityBySource = new Map((activity ?? []).map((a) => [a.source_id, a]));

  return (
    <AppShell email={email} displayName={displayName} unreadAlerts={unreadAlerts}>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Sources</h1>
            <p className="page-subtitle">Accounts and feeds you monitor — organized, prioritized, and synced.</p>
          </div>
        </div>
        <SourcesView
          initialSources={sources ?? []}
          categories={categories ?? []}
          activityBySource={Object.fromEntries(activityBySource)}
        />
      </div>
    </AppShell>
  );
}
