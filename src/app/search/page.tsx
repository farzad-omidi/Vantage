import { AppShell } from "@/components/AppShell";
import { requireViewer } from "@/lib/viewer";
import { ContentCard } from "@/components/ContentCard";
import { SearchIcon } from "@/components/icons";
import type { Tables } from "@/lib/database.types";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; item?: string }>;
}) {
  const { q, item } = await searchParams;
  const { supabase, user, email, displayName, unreadAlerts } = await requireViewer();

  let items: Tables<"content_items">[] = [];
  if (q && q.trim()) {
    const { data } = await supabase
      .from("content_items")
      .select("*")
      .textSearch("search_vector", q.trim(), { type: "websearch", config: "english" })
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(40);
    items = data ?? [];
  } else if (item) {
    const { data } = await supabase.from("content_items").select("*").eq("id", item).limit(1);
    items = data ?? [];
  }

  const itemIds = items.map((i) => i.id);
  const sourceIds = [...new Set(items.map((i) => i.source_id).filter((v): v is string => Boolean(v)))];
  const [{ data: analyses }, { data: sourceRows }] = await Promise.all([
    itemIds.length > 0 ? supabase.from("content_analysis").select("*").in("content_item_id", itemIds) : Promise.resolve({ data: [] }),
    sourceIds.length > 0 ? supabase.from("sources").select("id, name").in("id", sourceIds) : Promise.resolve({ data: [] }),
  ]);
  const analysisByItem = new Map((analyses ?? []).map((a) => [a.content_item_id, a]));
  const sourceNameById = new Map((sourceRows ?? []).map((s) => [s.id, s.name]));

  return (
    <AppShell email={email} displayName={displayName} unreadAlerts={unreadAlerts}>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Search</h1>
            <p className="page-subtitle">Full-text search across everything Vantage has ingested for you, {user.email}.</p>
          </div>
        </div>

        <form action="/search" className="row" style={{ marginBottom: 20 }}>
          <div className="input" style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, maxWidth: 480 }}>
            <SearchIcon size={15} className="mini" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search titles, bodies, authors…"
              style={{ border: "none", outline: "none", background: "transparent", width: "100%" }}
            />
          </div>
          <button className="primary" type="submit">
            Search
          </button>
        </form>

        {q && <p className="mini" style={{ marginBottom: 16 }}>{items.length} result{items.length === 1 ? "" : "s"} for &ldquo;{q}&rdquo;</p>}

        <div className="stack">
          {items.length === 0 ? (
            <div className="card empty-state">
              <p style={{ fontWeight: 600, color: "var(--ink)" }}>{q ? "No matches" : "Search your content"}</p>
              <p className="mini">{q ? "Try a different term." : "Enter a keyword to search across all ingested content."}</p>
            </div>
          ) : (
            items.map((it) => (
              <ContentCard
                key={it.id}
                item={{
                  ...it,
                  analysis: analysisByItem.get(it.id) ?? null,
                  source_name: it.source_id ? sourceNameById.get(it.source_id) : null,
                }}
              />
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
