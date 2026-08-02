import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { PriorityPill, SentimentPill, ClassificationBadge } from "@/components/Badges";
import { relativeTime, truncate } from "@/lib/format";
import { dirFor, languageName } from "@/lib/languages";
import { ExternalLinkIcon, LightbulbIcon } from "@/components/icons";

type ContentItem = Tables<"content_items">;
type Analysis = Tables<"content_analysis">;

export function ContentCard({
  item,
  topics,
  sourceLink = true,
}: {
  item: ContentItem & { analysis: Analysis | null; source_name?: string | null };
  topics?: { id: string; name: string }[];
  sourceLink?: boolean;
}) {
  const analysis = item.analysis;
  // The reader's language is whatever the analysis was written in; the item's
  // own language is what it was published in. They differ often, and each half
  // of the card needs its own direction.
  const readingDir = dirFor(analysis?.title_translated ? readingLanguageOf(analysis) : null);
  const sourceDir = dirFor(analysis?.language);
  const translated = analysis?.title_translated?.trim() || null;

  return (
    <div className="card card-pad">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {analysis && <PriorityPill priority={analysis.priority} />}
          {analysis && <ClassificationBadge classification={analysis.classification} />}
          {analysis && <SentimentPill sentiment={analysis.sentiment} />}
          {!analysis && <span className="pill pill-outline">Not analyzed yet</span>}
        </div>
        <span className="mini">{relativeTime(item.published_at ?? item.fetched_at)}</span>
      </div>

      <div style={{ marginTop: 10 }}>
        {translated ? (
          <>
            <h3 dir={readingDir} style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 2 }}>
              {translated}
            </h3>
            {/* The original stays visible: it is what you would search for, and
                what the author actually wrote. */}
            <p
              dir={sourceDir}
              className="mini"
              style={{ marginBottom: 4, fontStyle: "italic" }}
              title={`Original title (${languageName(analysis?.language)})`}
            >
              {item.title}
            </p>
          </>
        ) : (
          item.title && (
            <h3 dir={sourceDir} style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>
              {item.title}
            </h3>
          )
        )}
        <p className="mini" style={{ marginBottom: 4 }}>
          {sourceLink && item.source_id ? (
            <Link href={`/sources/${item.source_id}`} style={{ fontWeight: 600, color: "var(--ink)" }}>
              {item.source_name ?? item.author_name ?? "Unknown source"}
            </Link>
          ) : (
            <span style={{ fontWeight: 600, color: "var(--ink)" }}>{item.author_name ?? "Unknown source"}</span>
          )}
          {item.author_handle && ` · ${item.author_handle}`}
        </p>
        {item.body && (
          <p dir={sourceDir} style={{ color: "var(--muted)", fontSize: 13.5 }}>
            {truncate(item.body, 280)}
          </p>
        )}
      </div>

      {analysis?.summary && (
        <div
          dir={readingDir}
          style={{ marginTop: 12, padding: "10px 12px", background: "var(--surface2)", borderRadius: "var(--r-md)" }}
        >
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            AI summary
          </p>
          <p style={{ fontSize: 13 }}>{analysis.summary}</p>
          {analysis.importance_explanation && (
            <p className="mini" style={{ marginTop: 6 }}>
              <strong style={{ color: "var(--ink)" }}>Why it matters: </strong>
              {analysis.importance_explanation}
            </p>
          )}
          {analysis.opportunities && analysis.opportunities.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {analysis.opportunities.map((op, i) => (
                <div key={i} className="row mini" style={{ color: "var(--accent-dark)", marginTop: 3 }}>
                  <LightbulbIcon size={13} />
                  {op}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: "space-between", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {topics?.map((t) => (
            <Link key={t.id} href={`/topics/${t.id}`} className="pill pill-outline">
              {t.name}
            </Link>
          ))}
        </div>
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="mini row" style={{ gap: 4 }}>
            View original <ExternalLinkIcon size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

// The analysis rows do not store the language they were written in — it is the
// profile's reading language at the time. Inferring it from the translated
// title is enough to get the text direction right without another join.
function readingLanguageOf(analysis: Analysis): string | null {
  const text = analysis.title_translated ?? analysis.summary;
  if (!text) return null;
  // Arabic-script block covers Persian, Arabic and Urdu, which is all the RTL
  // this needs to distinguish.
  return /[\u0600-\u06FF\u0750-\u077F]/.test(text) ? "fa" : "en";
}
