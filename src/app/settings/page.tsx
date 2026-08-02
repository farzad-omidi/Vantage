import { AppShell } from "@/components/AppShell";
import { requireViewer } from "@/lib/viewer";
import { SettingsView } from "@/components/SettingsView";

export default async function SettingsPage() {
  const { supabase, user, email, displayName, preferredLanguage, unreadAlerts } = await requireViewer();

  const [{ data: categories }, { data: alertRules }, { data: topics }, { data: sources }] = await Promise.all([
    supabase.from("categories").select("*").eq("user_id", user.id).order("kind").order("sort_order"),
    supabase.from("alert_rules").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("topics").select("id, name").eq("user_id", user.id).order("name"),
    supabase.from("sources").select("id, name").eq("user_id", user.id).order("name"),
  ]);

  return (
    <AppShell email={email} displayName={displayName} unreadAlerts={unreadAlerts}>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Profile, reading language, categories, and alert rules.</p>
          </div>
        </div>
        <SettingsView
          email={email}
          displayName={displayName}
          preferredLanguage={preferredLanguage}
          categories={categories ?? []}
          alertRules={alertRules ?? []}
          topics={topics ?? []}
          sources={sources ?? []}
        />
      </div>
    </AppShell>
  );
}
