// App-level shared types that aren't 1:1 with a database row.

import type { Platform } from "@/lib/database.types";

export type Priority = "low" | "medium" | "high" | "critical";
export type ContentPriority = "low" | "medium" | "high" | "urgent";

export const PRIORITY_ORDER: Record<ContentPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

export const SOURCE_PRIORITY_ORDER: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export const PLATFORM_LABELS: Record<string, string> = {
  rss: "RSS feed",
  blog: "Blog",
  youtube: "YouTube",
  reddit: "Reddit",
  twitter: "X / Twitter",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  news: "News",
  email: "Email / org",
  other: "Other",
};

export const PLATFORMS_WITH_LIVE_INGESTION: Set<Platform> = new Set(["rss", "blog", "youtube", "reddit", "news"]);

export const CLASSIFICATION_LABELS: Record<string, string> = {
  news: "News",
  discussion: "Discussion",
  opportunity: "Opportunity",
  complaint: "Complaint",
  question: "Question",
  announcement: "Announcement",
  trend: "Trend",
  other: "Other",
};
