import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LANGUAGE } from "@/lib/languages";

// Shared "who's logged in + what does the shell need" fetch for every
// authenticated page. Redirects to /login if there's no session — proxy.ts
// already does this at the edge, but server components render before proxy
// guarantees are visible to TypeScript, so this is the belt-and-suspenders
// check that also gets us the data the shell chrome needs.
export async function requireViewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email, preferred_language")
    .eq("id", user.id)
    .single();

  const { count: unreadAlerts } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);

  return {
    supabase,
    user,
    email: profile?.email ?? user.email ?? "",
    displayName: profile?.display_name ?? null,
    preferredLanguage: profile?.preferred_language ?? DEFAULT_LANGUAGE,
    unreadAlerts: unreadAlerts ?? 0,
  };
}
