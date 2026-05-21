/**
 * Notification generation.
 *
 * Called by:
 *   - The /api/cron/notifications endpoint (hit by a scheduled cron job)
 *   - The scripts/check-reminders.ts CLI (run from system cron / OS scheduler)
 *
 * Strategy: idempotent per (forklift, type, calendar day) — we don't create a
 * duplicate notification if one of the same type already exists for the same
 * forklift today. For OVERDUE the `repeatOverdueReminderDays` setting controls
 * how often a fresh notification is generated.
 *
 * PUSH NOTIFICATIONS:
 *   Push delivery is intentionally pluggable. The function below logs where
 *   to send push notifications — implement Web Push (VAPID) or a third-party
 *   service inside `sendPushNotification` in `src/lib/push-notifications.ts`.
 */

import { prisma } from "./db";
import { getForkliftServiceStatus } from "./service-status";
import { sendPushNotification } from "./push-notifications";

export interface GeneratedNotification {
  forkliftId: string;
  type: "UPCOMING" | "DUE" | "OVERDUE";
  title: string;
  message: string;
  dueDate: Date | null;
  dueHours: number | null;
}

export async function generateServiceNotifications(): Promise<{
  created: number;
  skipped: number;
}> {
  const appSettings = await prisma.appSettings.findUnique({
    where: { id: "global" },
  });
  if (appSettings && !appSettings.remindersEnabled) {
    return { created: 0, skipped: 0 };
  }

  const forklifts = await prisma.forklift.findMany({
    where: { status: "ACTIVE" },
    include: { serviceSettings: true },
  });

  let created = 0;
  let skipped = 0;

  for (const f of forklifts) {
    if (!f.serviceSettings || !f.serviceSettings.remindersEnabled) {
      skipped++;
      continue;
    }
    const status = getForkliftServiceStatus(f, f.serviceSettings);

    let type: "UPCOMING" | "DUE" | "OVERDUE" | null = null;
    if (status.status === "OVERDUE") type = "OVERDUE";
    else if (status.status === "DUE") type = "DUE";
    else if (status.status === "UPCOMING") type = "UPCOMING";

    if (!type) {
      skipped++;
      continue;
    }

    // De-dupe window:
    //   UPCOMING / DUE  → 1 per calendar day
    //   OVERDUE         → respect repeatOverdueReminderDays (default 1 day)
    const repeatDays =
      type === "OVERDUE"
        ? (f.serviceSettings.repeatOverdueReminderDays ?? 1)
        : 1;
    const since = new Date();
    since.setDate(since.getDate() - repeatDays);

    const existing = await prisma.notification.findFirst({
      where: {
        forkliftId: f.id,
        type,
        createdAt: { gte: since },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const title =
      type === "OVERDUE"
        ? `טיפול באיחור — מלגזה ${f.internalNumber}`
        : type === "DUE"
          ? `טיפול נדרש — מלגזה ${f.internalNumber}`
          : `טיפול קרוב — מלגזה ${f.internalNumber}`;

    const notif = await prisma.notification.create({
      data: {
        forkliftId: f.id,
        type,
        title,
        message: `${f.description}: ${status.message}`,
        dueDate: f.serviceSettings.nextServiceDate,
        dueHours: f.serviceSettings.nextServiceHours,
      },
    });
    created++;

    // Fire-and-forget — push delivery is best-effort and pluggable.
    try {
      await sendPushNotification({
        title: notif.title,
        body: notif.message,
        forkliftId: f.id,
        type,
      });
    } catch (err) {
      console.error("[notifications] push delivery failed:", err);
    }
  }

  return { created, skipped };
}
