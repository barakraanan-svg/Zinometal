"use server";

import { prisma } from "@/lib/db";
import { generateServiceNotifications } from "@/lib/notifications";
import { revalidatePath } from "next/cache";

export async function markNotificationRead(id: string) {
  await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
  revalidatePath("/notifications");
  revalidatePath("/");
}

export async function markAllNotificationsRead() {
  await prisma.notification.updateMany({
    where: { isRead: false },
    data: { isRead: true },
  });
  revalidatePath("/notifications");
  revalidatePath("/");
}

export async function runReminderCheckNow(): Promise<void> {
  await generateServiceNotifications();
  revalidatePath("/notifications");
  revalidatePath("/");
}

export async function updateAppSettings(formData: FormData) {
  const defaultReminderDaysBefore = Number(
    formData.get("defaultReminderDaysBefore") ?? 14,
  );
  const defaultSecondReminderDays =
    formData.get("defaultSecondReminderDays") === ""
      ? null
      : Number(formData.get("defaultSecondReminderDays"));
  const defaultRepeatOverdueDays =
    formData.get("defaultRepeatOverdueDays") === ""
      ? null
      : Number(formData.get("defaultRepeatOverdueDays"));
  const dailyCheckTime =
    String(formData.get("dailyCheckTime") ?? "08:00") || "08:00";
  const remindersEnabled = formData.get("remindersEnabled") === "on";
  const enableInApp = formData.get("enableInApp") === "on";
  const enableEmail = formData.get("enableEmail") === "on";
  const enablePush = formData.get("enablePush") === "on";

  await prisma.appSettings.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      defaultReminderDaysBefore,
      defaultSecondReminderDays,
      defaultRepeatOverdueDays,
      dailyCheckTime,
      remindersEnabled,
      enableInApp,
      enableEmail,
      enablePush,
    },
    update: {
      defaultReminderDaysBefore,
      defaultSecondReminderDays,
      defaultRepeatOverdueDays,
      dailyCheckTime,
      remindersEnabled,
      enableInApp,
      enableEmail,
      enablePush,
    },
  });
  revalidatePath("/settings");
}
