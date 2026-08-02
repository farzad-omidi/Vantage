import Anthropic from "@anthropic-ai/sdk";
import type { ContentPriority, Sentiment } from "@/lib/database.types";
import { DEFAULT_LANGUAGE, languageName } from "@/lib/languages";

// Haiku 4.5 by default — this pipeline runs on every ingested item, so cost
// and latency matter more than peak reasoning quality. Override via env if a
// deployment wants deeper analysis on a smaller volume of higher-stakes topics.
const ANALYSIS_MODEL = process.env.ANTHROPIC_ANALYSIS_MODEL || "claude-haiku-4-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export type AnalysisInput = {
  title: string | null;
  body: string | null;
  authorName: string | null;
  platform: string;
  url: string | null;
  sourceName: string | null;
  sourceDescription: string | null;
  topics: { name: string; description: string | null; keywords: string[] }[];
  /**
   * Language the analysis should be WRITTEN in (the reader's language), which
   * is independent of the language the content was published in.
   */
  outputLanguage?: string;
};

export type AnalysisResult = {
  isRelevant: boolean;
  relevanceScore: number;
  classification: string;
  summary: string;
  importanceExplanation: string;
  opportunities: string[];
  priority: ContentPriority;
  sentiment: Sentiment;
  language: string;
  titleTranslated: string | null;
};

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: "submit_analysis",
  description: "Submit the structured intelligence analysis of a piece of monitored content.",
  input_schema: {
    type: "object",
    properties: {
      is_relevant: {
        type: "boolean",
        description: "Whether this content is genuinely relevant to the user's tracked topics/sources — not just a keyword coincidence.",
      },
      relevance_score: {
        type: "number",
        description: "0.0 (irrelevant) to 1.0 (highly relevant).",
      },
      classification: {
        type: "string",
        enum: ["news", "discussion", "opportunity", "complaint", "question", "announcement", "trend", "other"],
        description: "The single best category for this content.",
      },
      summary: {
        type: "string",
        description: "A 1-2 sentence neutral summary of what this content says.",
      },
      importance_explanation: {
        type: "string",
        description: "1-2 sentences on WHY this matters to someone tracking these topics/sources — the specific implication, not a restatement of the summary.",
      },
      opportunities: {
        type: "array",
        items: { type: "string" },
        description: "Concrete opportunities this content suggests (a lead, a partnership angle, a content idea, a competitive signal). Empty array if none.",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high", "urgent"],
        description: "How urgently a human should see this. 'urgent' is rare — reserve for time-sensitive, high-stakes items.",
      },
      sentiment: {
        type: "string",
        enum: ["positive", "neutral", "negative", "mixed"],
      },
      language: {
        type: "string",
        description: "ISO 639-1 code of the content's ORIGINAL language (e.g. 'en', 'fa', 'id'). Report what the content is written in, not the language you are replying in.",
      },
      title_translated: {
        type: "string",
        description: "The content's title rendered in the output language. If the title is already in the output language, repeat it unchanged.",
      },
    },
    required: [
      "is_relevant",
      "relevance_score",
      "classification",
      "summary",
      "importance_explanation",
      "opportunities",
      "priority",
      "sentiment",
      "language",
      "title_translated",
    ],
  },
};

function systemPrompt(outputLanguage: string): string {
  const target = languageName(outputLanguage);
  return `You are the analysis engine inside Vantage, a social & market intelligence platform. You evaluate one piece of monitored content at a time against the topics the user is tracking, and produce a structured judgment via the submit_analysis tool.

Be a skeptical, precise analyst: relevance means substantive connection to a tracked topic, not string overlap. Judge importance from the user's likely goal (monitoring a market, a competitor, a community, a keyword) implied by their topic descriptions. Keep summaries and explanations tight — no filler, no restating the title. Only flag genuine opportunities; an empty list is a correct answer far more often than not.

LANGUAGE. Monitored content arrives in many languages. Read and reason about it in its original language — never translate before analyzing, because nuance lost in translation is nuance lost from the judgment. Then write every human-readable field (summary, importance_explanation, opportunities, title_translated) in ${target}, whatever the content was written in. Two fields are exceptions: 'language' reports the ISO code of the content's ORIGINAL language, and the enum fields take their fixed English values.

Translate meaning, not words. Keep proper nouns, organisation names, handles and product names in their original form rather than transliterating them — someone acting on this needs to be able to search for the name they will actually encounter. Where a term has no natural equivalent in ${target}, give the ${target} sense and put the original in parentheses once.`;
}

export async function analyzeContent(input: AnalysisInput): Promise<AnalysisResult> {
  const topicContext =
    input.topics.length > 0
      ? input.topics
          .map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""} (keywords: ${t.keywords.join(", ") || "none"})`)
          .join("\n")
      : "(no specific topic matched — judge general relevance to a professional monitoring this source)";

  const userMessage = `SOURCE: ${input.sourceName ?? "Unknown"} (${input.platform})${
    input.sourceDescription ? `\nSource notes: ${input.sourceDescription}` : ""
  }
AUTHOR: ${input.authorName ?? "Unknown"}
URL: ${input.url ?? "N/A"}

TRACKED TOPICS THIS MIGHT RELATE TO:
${topicContext}

CONTENT TITLE: ${input.title ?? "(none)"}

CONTENT BODY:
${(input.body ?? "(no body text)").slice(0, 6000)}`;

  const outputLanguage = input.outputLanguage || DEFAULT_LANGUAGE;
  const response = await getClient().messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 1024,
    system: systemPrompt(outputLanguage),
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: "tool", name: "submit_analysis" },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");

  if (!toolUse) {
    // Defensive fallback — should not happen with a forced tool_choice, but
    // never let the ingestion pipeline crash on an analysis hiccup.
    return {
      isRelevant: true,
      relevanceScore: 0.5,
      classification: "other",
      summary: "Analysis unavailable.",
      importanceExplanation: "",
      opportunities: [],
      priority: "low",
      sentiment: "neutral",
      language: "en",
      titleTranslated: null,
    };
  }

  const result = toolUse.input as {
    is_relevant: boolean;
    relevance_score: number;
    classification: string;
    summary: string;
    importance_explanation: string;
    opportunities: string[];
    priority: ContentPriority;
    sentiment: Sentiment;
    language: string;
    title_translated?: string;
  };

  return {
    isRelevant: result.is_relevant,
    relevanceScore: result.relevance_score,
    classification: result.classification,
    summary: result.summary,
    importanceExplanation: result.importance_explanation,
    opportunities: result.opportunities ?? [],
    priority: result.priority,
    sentiment: result.sentiment,
    language: result.language,
    // Only worth storing when it actually differs from the original — a
    // repeated title is noise in the UI.
    titleTranslated:
      result.title_translated && result.title_translated.trim() !== (input.title ?? "").trim()
        ? result.title_translated.trim()
        : null,
  };
}
