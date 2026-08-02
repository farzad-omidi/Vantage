import Anthropic from "@anthropic-ai/sdk";

const DISCOVERY_MODEL = process.env.ANTHROPIC_DISCOVERY_MODEL || "claude-sonnet-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export type SourceSuggestion = {
  name: string;
  handle: string | null;
  platform: string;
  url: string | null;
  reason: string;
};

const PROPOSE_TOOL: Anthropic.Tool = {
  name: "propose_sources",
  description: "Propose accounts, feeds, or publications worth monitoring for this topic.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Display name of the account/publication/person." },
            handle: { type: "string", description: "@handle if applicable, otherwise omit." },
            platform: {
              type: "string",
              enum: ["rss", "blog", "youtube", "reddit", "twitter", "linkedin", "news", "other"],
            },
            url: { type: "string", description: "Profile or homepage URL." },
            reason: {
              type: "string",
              description: "One sentence on why this is a strong source for the topic, citing what you found.",
            },
          },
          required: ["name", "platform", "reason"],
        },
      },
    },
    required: ["suggestions"],
  },
};

// Uses Claude's server-side web_search tool to find real, currently-active
// sources for a topic — this is genuine open-web discovery, not just mining
// already-ingested content. Costs a web-search fee per call (billed through
// the Anthropic API, no separate search API key needed) — see the discovery
// page in-app for the cost note.
export async function discoverSourcesForTopic(
  topicName: string,
  topicDescription: string | null,
  excludeNames: string[]
): Promise<SourceSuggestion[]> {
  const exclusionText =
    excludeNames.length > 0
      ? `Already tracked — do not suggest these again: ${excludeNames.slice(0, 60).join(", ")}.`
      : "Nothing is tracked for this topic yet.";

  const response = await getClient().messages.create({
    model: DISCOVERY_MODEL,
    max_tokens: 2048,
    system:
      "You are the discovery engine inside Vantage, a social & market intelligence platform. Search the web to find real, currently active accounts, blogs, publications, or channels that would be valuable to monitor for a given topic. Prioritize primary sources and recognized voices over aggregators. When you have good candidates, call propose_sources. If you find nothing genuinely new and relevant, call propose_sources with an empty suggestions array — do not invent sources.",
    // web_search_20250305 is the basic variant supported by the installed SDK version;
    // upgrade to web_search_20260209 (dynamic filtering) once @anthropic-ai/sdk ships
    // its types — the request shape is otherwise identical.
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }, PROPOSE_TOOL],
    messages: [
      {
        role: "user",
        content: `Topic: ${topicName}${topicDescription ? `\nContext: ${topicDescription}` : ""}\n\n${exclusionText}\n\nFind up to 5 accounts or sources worth monitoring for this topic.`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "propose_sources"
  );
  if (!toolUse) return [];

  const input = toolUse.input as { suggestions: SourceSuggestion[] };
  return (input.suggestions ?? []).map((s) => ({
    name: s.name,
    handle: s.handle ?? null,
    platform: s.platform,
    url: s.url ?? null,
    reason: s.reason,
  }));
}
