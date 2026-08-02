import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireViewer } from "@/lib/viewer";
import { PriorityPill } from "@/components/Badges";
import { relativeTime, initials } from "@/lib/format";

const STAGE_ORDER = ["partner", "engaged", "watching", "new"] as const;

export default async function KnowledgePage() {
  const { supabase, user, email, displayName, unreadAlerts } = await requireViewer();

  const { data: sources } = await supabase
    .from("sources")
    .select("*")
    .eq("user_id", user.id)
    .or("is_saved.eq.true,relationship_stage.neq.new")
    .order("updated_at", { ascending: false });

  const sourceIds = (sources ?? []).map((s) => s.id);
  const [{ data: notes }, { data: interactions }] = await Promise.all([
    sourceIds.length > 0
      ? supabase.from("source_notes").select("source_id, created_at").in("source_id", sourceIds)
      : Promise.resolve({ data: [] }),
    sourceIds.length > 0
      ? supabase.from("source_interactions").select("source_id, occurred_at").in("source_id", sourceIds)
      : Promise.resolve({ data: [] }),
  ]);

  const noteCounts = new Map<string, number>();
  for (const n of notes ?? []) noteCounts.set(n.source_id, (noteCounts.get(n.source_id) ?? 0) + 1);
  const lastInteraction = new Map<string, string>();
  for (const i of interactions ?? []) {
    const current = lastInteraction.get(i.source_id);
    if (!current || i.occurred_at > current) lastInteraction.set(i.source_id, i.occurred_at);
  }

  const grouped = STAGE_ORDER.map((stage) => ({
    stage,
    sources: (sources ?? []).filter((s) => s.relationship_stage === stage || (stage === "new" && s.is_saved && s.relationship_stage === "new")),
  })).filter((g) => g.sources.length > 0);

  return (
    <AppShell email={email} displayName={displayName} unreadAlerts={unreadAlerts}>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Knowledge</h1>
            <p className="page-subtitle">Saved sources and relationships — notes, interaction history, and stage tracking.</p>
          </div>
        </div>

        {(sources ?? []).length === 0 ? (
          <div className="card empty-state">
            <p style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Nothing saved yet</p>
            <p className="mini">
              Save a source or move it past &ldquo;New&rdquo; on its detail page to start building your knowledge base.
            </p>
          </div>
        ) : (
          <div className="stack" style={{ gap: 28 }}>
            {grouped.map((group) => (
              <div key={group.stage}>
                <p className="eyebrow" style={{ marginBottom: 12 }}>
                  {group.stage} ({group.sources.length})
                </p>
                <div className="grid grid-2">
                  {group.sources.map((source) => (
                    <Link key={source.id} href={`/sources/${source.id}`} className="card card-pad">
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div className="row">
                          <div className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                            {initials(source.name)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{source.name}</div>
                            {source.handle && <div className="mini">{source.handle}</div>}
                          </div>
                        </div>
                        <PriorityPill priority={source.priority} />
                      </div>
                      <div className="row mini" style={{ marginTop: 12, justifyContent: "space-between" }}>
                        <span>{noteCounts.get(source.id) ?? 0} notes</span>
                        <span>
                          {lastInteraction.get(source.id)
                            ? `Last contact ${relativeTime(lastInteraction.get(source.id))}`
                            : "No interactions logged"}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
