import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Reports which server-side configuration the *running deployment* can actually
// see. "I added the key" and "the server has the key" fail to line up often
// enough — wrong environment scope, wrong project, a typo in the name, a
// deployment that predates the change — that guessing is not worth anyone's
// time.
//
// Never returns a secret. Presence, length and shape only: enough to tell a
// missing variable from a truncated paste from a value in the wrong field.
export const dynamic = "force-dynamic";

function describe(value: string | undefined, expectedPrefix?: string) {
  if (!value) return { present: false };
  return {
    present: true,
    length: value.length,
    ...(expectedPrefix ? { hasExpectedPrefix: value.startsWith(expectedPrefix) } : {}),
    // A value pasted with surrounding whitespace or quotes is set but broken,
    // and looks identical to a good one in the dashboard.
    hasSurroundingWhitespace: value !== value.trim(),
    isQuoted: /^["'].*["']$/.test(value),
  };
}

export async function GET() {
  // Signed-in only: this describes server configuration, which is not something
  // to hand to anonymous callers even in redacted form.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    deployment: {
      // Which build answered — confirms whether the expected code is serving.
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      env: process.env.VERCEL_ENV ?? "local",
      region: process.env.VERCEL_REGION ?? null,
    },
    required: {
      NEXT_PUBLIC_SUPABASE_URL: describe(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: describe(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    },
    features: {
      // Powers analysis + the Claude half of discovery.
      ANTHROPIC_API_KEY: describe(process.env.ANTHROPIC_API_KEY, "sk-ant-"),
      // Powers channel resolution, audience size, and YouTube discovery.
      YOUTUBE_API_KEY: describe(process.env.YOUTUBE_API_KEY),
    },
    scheduled: {
      SUPABASE_SERVICE_ROLE_KEY: describe(process.env.SUPABASE_SERVICE_ROLE_KEY),
      CRON_SECRET: describe(process.env.CRON_SECRET),
    },
  });
}
