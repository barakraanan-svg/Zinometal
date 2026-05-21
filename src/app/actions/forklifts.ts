"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  calculateNextServiceDate,
  calculateNextServiceHours,
} from "@/lib/service-status";

function str(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function num(v: FormDataEntryValue | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function int(v: FormDataEntryValue | null): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

function bool(v: FormDataEntryValue | null): boolean {
  return v === "on" || v === "true" || v === "1";
}

function date(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function createForklift(formData: FormData) {
  const internalNumber = str(formData.get("internalNumber"));
  const description = str(formData.get("description"));
  if (!internalNumber) throw new Error("מספר מלגזה הוא שדה חובה");
  if (!description) throw new Error("תיאור הוא שדה חובה");

  const year = int(formData.get("year"));
  if (year !== null && (year < 1950 || year > new Date().getFullYear() + 1)) {
    throw new Error("שנת ייצור לא תקינה");
  }

  const currentHours = num(formData.get("currentHours")) ?? 0;
  if (currentHours < 0) throw new Error("שעות עבודה חייבות להיות מספר חיובי");

  const forklift = await prisma.forklift.create({
    data: {
      internalNumber,
      description,
      manufacturer: str(formData.get("manufacturer")),
      model: str(formData.get("model")),
      serialNumber: str(formData.get("serialNumber")),
      year,
      fuelType: str(formData.get("fuelType")) ?? "ELECTRIC",
      location: str(formData.get("location")),
      department: str(formData.get("department")),
      responsiblePerson: str(formData.get("responsiblePerson")),
      status: str(formData.get("status")) ?? "ACTIVE",
      currentHours,
      notes: str(formData.get("notes")),
    },
  });

  // Optionally create initial service settings if interval fields were provided.
  const dateIntervalMonths = int(formData.get("dateIntervalMonths"));
  const hoursInterval = num(formData.get("hoursInterval"));
  const trackingMode = str(formData.get("trackingMode")) ?? "BOTH";
  const reminderDaysBefore = int(formData.get("reminderDaysBefore")) ?? 14;
  const lastServiceDate = date(formData.get("lastServiceDate"));
  const lastServiceHours = num(formData.get("lastServiceHours"));

  if (dateIntervalMonths || hoursInterval) {
    await prisma.serviceSettings.create({
      data: {
        forkliftId: forklift.id,
        trackingMode,
        dateIntervalMonths,
        hoursInterval,
        lastServiceDate,
        lastServiceHours,
        nextServiceDate: calculateNextServiceDate(
          lastServiceDate,
          dateIntervalMonths,
        ),
        nextServiceHours: calculateNextServiceHours(
          lastServiceHours,
          hoursInterval,
        ),
        reminderDaysBefore,
      },
    });
  }

  revalidatePath("/");
  revalidatePath("/forklifts");
  redirect(`/forklifts/${forklift.id}`);
}

export async function updateForklift(id: string, formData: FormData) {
  const internalNumber = str(formData.get("internalNumber"));
  const description = str(formData.get("description"));
  if (!internalNumber) throw new Error("מספר מלגזה הוא שדה חובה");
  if (!description) throw new Error("תיאור הוא שדה חובה");

  const year = int(formData.get("year"));
  if (year !== null && (year < 1950 || year > new Date().getFullYear() + 1)) {
    throw new Error("שנת ייצור לא תקינה");
  }

  const currentHours = num(formData.get("currentHours")) ?? 0;
  if (currentHours < 0) throw new Error("שעות עבודה חייבות להיות מספר חיובי");

  await prisma.forklift.update({
    where: { id },
    data: {
      internalNumber,
      description,
      manufacturer: str(formData.get("manufacturer")),
      model: str(formData.get("model")),
      serialNumber: str(formData.get("serialNumber")),
      year,
      fuelType: str(formData.get("fuelType")) ?? "ELECTRIC",
      location: str(formData.get("location")),
      department: str(formData.get("department")),
      responsiblePerson: str(formData.get("responsiblePerson")),
      status: str(formData.get("status")) ?? "ACTIVE",
      currentHours,
      notes: str(formData.get("notes")),
    },
  });

  revalidatePath("/");
  revalidatePath("/forklifts");
  revalidatePath(`/forklifts/${id}`);
  redirect(`/forklifts/${id}`);
}

export async function archiveForklift(id: string) {
  await prisma.forklift.update({
    where: { id },
    data: { status: "INACTIVE" },
  });
  revalidatePath("/");
  revalidatePath("/forklifts");
  revalidatePath(`/forklifts/${id}`);
}

export async function updateServiceSettings(
  forkliftId: string,
  formData: FormData,
) {
  const trackingMode = str(formData.get("trackingMode")) ?? "BOTH";
  const dateIntervalMonths = int(formData.get("dateIntervalMonths"));
  const hoursInterval = num(formData.get("hoursInterval"));
  const lastServiceDate = date(formData.get("lastServiceDate"));
  const lastServiceHours = num(formData.get("lastServiceHours"));
  const reminderDaysBefore = int(formData.get("reminderDaysBefore")) ?? 14;
  const secondReminderDaysBefore = int(
    formData.get("secondReminderDaysBefore"),
  );
  const repeatOverdueReminderDays = int(
    formData.get("repeatOverdueReminderDays"),
  );
  const hoursReminderThreshold = num(formData.get("hoursReminderThreshold"));
  const remindersEnabled = bool(formData.get("remindersEnabled"));

  if (dateIntervalMonths !== null && dateIntervalMonths < 0)
    throw new Error("מרווח טיפול בחודשים חייב להיות חיובי");
  if (hoursInterval !== null && hoursInterval < 0)
    throw new Error("מרווח טיפול בשעות חייב להיות חיובי");

  // Manual overrides for next-service take precedence if provided.
  const explicitNextDate = date(formData.get("nextServiceDate"));
  const explicitNextHours = num(formData.get("nextServiceHours"));

  const nextServiceDate =
    explicitNextDate ??
    calculateNextServiceDate(lastServiceDate, dateIntervalMonths);
  const nextServiceHours =
    explicitNextHours ??
    calculateNextServiceHours(lastServiceHours, hoursInterval);

  await prisma.serviceSettings.upsert({
    where: { forkliftId },
    create: {
      forkliftId,
      trackingMode,
      dateIntervalMonths,
      hoursInterval,
      lastServiceDate,
      lastServiceHours,
      nextServiceDate,
      nextServiceHours,
      reminderDaysBefore,
      secondReminderDaysBefore,
      repeatOverdueReminderDays,
      hoursReminderThreshold,
      remindersEnabled,
    },
    update: {
      trackingMode,
      dateIntervalMonths,
      hoursInterval,
      lastServiceDate,
      lastServiceHours,
      nextServiceDate,
      nextServiceHours,
      reminderDaysBefore,
      secondReminderDaysBefore,
      repeatOverdueReminderDays,
      hoursReminderThreshold,
      remindersEnabled,
    },
  });

  revalidatePath("/");
  revalidatePath("/forklifts");
  revalidatePath(`/forklifts/${forkliftId}`);
  redirect(`/forklifts/${forkliftId}`);
}
