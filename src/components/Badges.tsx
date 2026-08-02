import { CLASSIFICATION_LABELS, PLATFORM_LABELS } from "@/lib/types";

export function PriorityPill({ priority }: { priority: string }) {
  return <span className={`pill pill-${priority}`}>{priority}</span>;
}

export function SentimentPill({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  const cls = sentiment === "positive" ? "positive" : sentiment === "negative" ? "negative" : "neutral";
  return <span className={`pill pill-${cls}`}>{sentiment}</span>;
}

export function PlatformBadge({ platform }: { platform: string }) {
  return <span className="pill pill-outline">{PLATFORM_LABELS[platform] ?? platform}</span>;
}

export function ClassificationBadge({ classification }: { classification: string | null }) {
  if (!classification) return null;
  return <span className="pill pill-outline">{CLASSIFICATION_LABELS[classification] ?? classification}</span>;
}

export function StatusDot({ status }: { status: "active" | "paused" }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className={`dot ${status === "active" ? "dot-active" : "dot-paused"}`} />
      <span className="mini" style={{ textTransform: "capitalize" }}>
        {status}
      </span>
    </span>
  );
}
