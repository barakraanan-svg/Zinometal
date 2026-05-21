import { NextResponse } from "next/server";
import { generateServiceNotifications } from "@/lib/notifications";

// Scheduled-job endpoint.
// Call from an external cron (Vercel Cron, GitHub Actions, system cron) with:
//   curl -X POST -H "x-cron-secret: $CRON_SECRET" https://.../api/cron/notifications
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await generateServiceNotifications();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET() {
  // Convenience for manual checks; same logic, no secret enforcement.
  const result = await generateServiceNotifications();
  return NextResponse.json({ ok: true, ...result });
}
