import { AppShell } from "@/components/AppShell";
import { requireViewer } from "@/lib/viewer";
import { DiscoveryView } from "@/components/DiscoveryView";

export default async function DiscoveryPage() {
  const { supabase, user, email, displayName, unreadAlerts } = await requireViewer();

  const { data: suggestions } = await supabase
    .from("source_suggestions")
    .select("*")
    .eq("user_id", user.id)
    .order("discovered_at", { ascending: false });

  return (
    <AppShell email={email} displayName={displayName} unreadAlerts={unreadAlerts}>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Discovery</h1>
            <p className="page-subtitle">
              AI-found accounts and publications worth monitoring, based on your active topics.
            </p>
          </div>
        </div>
        <DiscoveryView initialSuggestions={suggestions ?? []} />
      </div>
    </AppShell>
  );
}
