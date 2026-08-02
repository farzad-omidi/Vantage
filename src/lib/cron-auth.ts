import { NextResponse, type NextRequest } from "next/server";

// Shared guard for src/app/api/cron/* routes — these run with the service
// role (bypassing RLS) on behalf of the platform itself, not a signed-in
// user, so they're protected by a shared secret instead of a session.
// Point an external scheduler (Vercel Cron, GitHub Actions, cron-job.org)
// at these routes with this header set.
export function requireCronSecret(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
