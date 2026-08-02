import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireViewer } from "@/lib/viewer";
import { SourceDetailView } from "@/components/SourceDetailView";

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, email, displayName, unreadAlerts } = await requireViewer();

  const { data: source } = await supabase.from("sources").select("*").eq("id", id).eq("user_id", user.id).single();
  if (!source) notFound();

  const [{ data: items }, { data: notes }, { data: interactions }, { data: categories }] = await Promise.all([
    supabase
      .from("content_items")
      .select("*")
      .eq("source_id", id)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(50),
    supabase.from("source_notes").select("*").eq("source_id", id).order("created_at", { ascending: false }),
    supabase.from("source_interactions").select("*").eq("source_id", id).order("occurred_at", { ascending: false }),
    supabase.from("categories").select("*").eq("user_id", user.id).eq("kind", "source").order("sort_order"),
  ]);

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: analyses } =
    itemIds.length > 0
      ? await supabase.from("content_analysis").select("*").in("content_item_id", itemIds)
      : { data: [] };
  const analysisByItem = new Map((analyses ?? []).map((a) => [a.content_item_id, a]));
  const itemsWithAnalysis = (items ?? []).map((item) => ({ ...item, analysis: analysisByItem.get(item.id) ?? null }));

  return (
    <AppShell email={email} displayName={displayName} unreadAlerts={unreadAlerts}>
      <div className="page">
        <SourceDetailView
          source={source}
          items={itemsWithAnalysis}
          notes={notes ?? []}
          interactions={interactions ?? []}
          categories={categories ?? []}
        />
      </div>
    </AppShell>
  );
}
