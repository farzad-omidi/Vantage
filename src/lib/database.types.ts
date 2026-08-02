// Hand-written to match supabase/schema.sql exactly (no live project to
// generate against yet). Regenerate with the Supabase CLI / MCP
// generate_typescript_types once a project exists, and keep this file
// as the source of truth for the schema shape until then.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Platform =
  | "rss"
  | "blog"
  | "youtube"
  | "reddit"
  | "twitter"
  | "instagram"
  | "linkedin"
  | "news"
  | "email"
  | "other";
export type Priority = "low" | "medium" | "high" | "critical";
export type ContentPriority = "low" | "medium" | "high" | "urgent";
export type SourceStatus = "active" | "paused";
export type RelationshipStage = "new" | "watching" | "engaged" | "partner";
export type Sentiment = "positive" | "neutral" | "negative" | "mixed";
export type InteractionKind = "viewed" | "contacted" | "replied" | "meeting" | "collaboration" | "other";
export type SuggestionStatus = "new" | "approved" | "dismissed";
export type DigestFrequency = "realtime" | "daily" | "weekly";
export type CategoryKind = "source" | "topic";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  vantage: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          kind: CategoryKind;
          name: string;
          color: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: CategoryKind;
          name: string;
          color?: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["categories"]["Insert"]>;
        Relationships: [];
      };
      sources: {
        Row: {
          id: string;
          user_id: string;
          category_id: string | null;
          name: string;
          handle: string | null;
          platform: Platform;
          profile_url: string | null;
          feed_url: string | null;
          priority: Priority;
          status: SourceStatus;
          is_saved: boolean;
          relationship_stage: RelationshipStage;
          avatar_url: string | null;
          description: string | null;
          language: string;
          region: string | null;
          last_synced_at: string | null;
          last_sync_status: "success" | "error" | null;
          last_sync_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id?: string | null;
          name: string;
          handle?: string | null;
          platform: Platform;
          profile_url?: string | null;
          feed_url?: string | null;
          priority?: Priority;
          status?: SourceStatus;
          is_saved?: boolean;
          relationship_stage?: RelationshipStage;
          avatar_url?: string | null;
          description?: string | null;
          language?: string;
          region?: string | null;
          last_synced_at?: string | null;
          last_sync_status?: "success" | "error" | null;
          last_sync_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["sources"]["Insert"]>;
        Relationships: [];
      };
      topics: {
        Row: {
          id: string;
          user_id: string;
          category_id: string | null;
          name: string;
          description: string | null;
          keywords: string[];
          priority: Priority;
          status: SourceStatus;
          language: string;
          region: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id?: string | null;
          name: string;
          description?: string | null;
          keywords?: string[];
          priority?: Priority;
          status?: SourceStatus;
          language?: string;
          region?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["topics"]["Insert"]>;
        Relationships: [];
      };
      content_items: {
        Row: {
          id: string;
          user_id: string;
          source_id: string | null;
          platform: string;
          external_id: string | null;
          url: string | null;
          author_name: string | null;
          author_handle: string | null;
          title: string | null;
          body: string | null;
          content_hash: string;
          published_at: string | null;
          fetched_at: string;
          raw: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_id?: string | null;
          platform: string;
          external_id?: string | null;
          url?: string | null;
          author_name?: string | null;
          author_handle?: string | null;
          title?: string | null;
          body?: string | null;
          content_hash: string;
          published_at?: string | null;
          fetched_at?: string;
          raw?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["content_items"]["Insert"]>;
        Relationships: [];
      };
      content_topic_matches: {
        Row: {
          content_item_id: string;
          topic_id: string;
          user_id: string;
          match_reason: "keyword" | "ai";
          created_at: string;
        };
        Insert: {
          content_item_id: string;
          topic_id: string;
          user_id: string;
          match_reason?: "keyword" | "ai";
          created_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["content_topic_matches"]["Insert"]>;
        Relationships: [];
      };
      content_analysis: {
        Row: {
          id: string;
          content_item_id: string;
          user_id: string;
          is_relevant: boolean;
          relevance_score: number | null;
          classification: string | null;
          summary: string | null;
          importance_explanation: string | null;
          opportunities: string[];
          priority: ContentPriority;
          sentiment: Sentiment | null;
          language: string | null;
          model: string | null;
          analyzed_at: string;
        };
        Insert: {
          id?: string;
          content_item_id: string;
          user_id: string;
          is_relevant?: boolean;
          relevance_score?: number | null;
          classification?: string | null;
          summary?: string | null;
          importance_explanation?: string | null;
          opportunities?: string[];
          priority?: ContentPriority;
          sentiment?: Sentiment | null;
          language?: string | null;
          model?: string | null;
          analyzed_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["content_analysis"]["Insert"]>;
        Relationships: [];
      };
      alerts: {
        Row: {
          id: string;
          user_id: string;
          content_item_id: string | null;
          source_id: string | null;
          topic_id: string | null;
          title: string;
          message: string | null;
          priority: ContentPriority;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content_item_id?: string | null;
          source_id?: string | null;
          topic_id?: string | null;
          title: string;
          message?: string | null;
          priority: ContentPriority;
          is_read?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["alerts"]["Insert"]>;
        Relationships: [];
      };
      alert_rules: {
        Row: {
          id: string;
          user_id: string;
          topic_id: string | null;
          source_id: string | null;
          name: string;
          min_priority: ContentPriority;
          digest_frequency: DigestFrequency;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          topic_id?: string | null;
          source_id?: string | null;
          name: string;
          min_priority?: ContentPriority;
          digest_frequency?: DigestFrequency;
          active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["alert_rules"]["Insert"]>;
        Relationships: [];
      };
      source_notes: {
        Row: {
          id: string;
          user_id: string;
          source_id: string;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_id: string;
          note: string;
          created_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["source_notes"]["Insert"]>;
        Relationships: [];
      };
      source_interactions: {
        Row: {
          id: string;
          user_id: string;
          source_id: string;
          kind: InteractionKind;
          notes: string | null;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_id: string;
          kind: InteractionKind;
          notes?: string | null;
          occurred_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["source_interactions"]["Insert"]>;
        Relationships: [];
      };
      source_suggestions: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          handle: string | null;
          platform: Platform;
          url: string | null;
          reason: string | null;
          based_on_topic_id: string | null;
          based_on_source_id: string | null;
          mention_count: number;
          status: SuggestionStatus;
          discovered_at: string;
          dedupe_key: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          handle?: string | null;
          platform: Platform;
          url?: string | null;
          reason?: string | null;
          based_on_topic_id?: string | null;
          based_on_source_id?: string | null;
          mention_count?: number;
          status?: SuggestionStatus;
          discovered_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["source_suggestions"]["Insert"]>;
        Relationships: [];
      };
      ingestion_runs: {
        Row: {
          id: string;
          user_id: string;
          source_id: string | null;
          status: "success" | "error";
          items_found: number;
          items_new: number;
          error: string | null;
          ran_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_id?: string | null;
          status: "success" | "error";
          items_found?: number;
          items_new?: number;
          error?: string | null;
          ran_at?: string;
        };
        Update: Partial<Database["vantage"]["Tables"]["ingestion_runs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      topic_daily_activity: {
        Row: {
          user_id: string;
          topic_id: string;
          day: string;
          item_count: number;
          high_priority_count: number;
        };
        Relationships: [];
      };
      source_activity_summary: {
        Row: {
          source_id: string;
          user_id: string;
          total_items: number;
          last_item_at: string | null;
          items_last_7_days: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      approve_source_suggestion: {
        Args: { p_suggestion_id: string };
        Returns: string;
      };
    };
  };
};

export type Tables<T extends keyof Database["vantage"]["Tables"]> = Database["vantage"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["vantage"]["Tables"]> = Database["vantage"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["vantage"]["Tables"]> = Database["vantage"]["Tables"][T]["Update"];
export type Views<T extends keyof Database["vantage"]["Views"]> = Database["vantage"]["Views"][T]["Row"];
