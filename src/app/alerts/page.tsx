import { AppShell } from "@/components/AppShell";
import { requireViewer } from "@/lib/viewer";
import { AlertsView } from "@/components/AlertsView";

export default async function AlertsPage() {
  const { supabase, user, email, displayName, unreadAlerts } = await requireViewer();

  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const sourceIds = [...new Set((alerts ?? []).map((a) => a.source_id).filter((v): v is string => Boolean(v)))];
  const topicIds = [...new Set((alerts ?? []).map((a) => a.topic_id).filter((v): v is string => Boolean(v)))];
  const [{ data: sources }, { data: topics }] = await Promise.all([
    sourceIds.length > 0 ? supabase.from("sources").select("id, name").in("id", sourceIds) : Promise.resolve({ data: [] }),
    topicIds.length > 0 ? supabase.from("topics").select("id, name").in("id", topicIds) : Promise.resolve({ data: [] }),
  ]);

  return (
    <AppShell email={email} displayName={displayName} unreadAlerts={unreadAlerts}>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Alerts</h1>
            <p className="page-subtitle">Filtered, prioritized notifications — only what&apos;s worth interrupting you for.</p>
          </div>
        </div>
        <AlertsView
          initialAlerts={alerts ?? []}
          sourceNames={Object.fromEntries((sources ?? []).map((s) => [s.id, s.name]))}
          topicNames={Object.fromEntries((topics ?? []).map((t) => [t.id, t.name]))}
        />
      </div>
    </AppShell>
  );
}
