import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// Shared guard for src/app/api/cron/* routes — these run with the service
// role (bypassing RLS) on behalf of the platform itself, not a signed-in
// user, so they're protected by a shared secret instead of a session.
//
// Two header forms are accepted because the two realistic schedulers disagree:
// GitHub Actions and most cron services can set an arbitrary header
// (`x-cron-secret`), while Vercel Cron cannot, and instead sends
// `Authorization: Bearer $CRON_SECRET` of its own accord.

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, and the throw would itself
  // leak the length, so compare lengths first and bail uniformly.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function requireCronSecret(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Distinguish "not set up" from "wrong secret". A 401 here would send
    // someone hunting for a bad secret when the real answer is that the
    // variable was never configured.
    return NextResponse.json(
      { error: "Scheduled routes are disabled: CRON_SECRET is not configured on the server." },
      { status: 503 }
    );
  }

  const provided = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!provided || !secretsMatch(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
