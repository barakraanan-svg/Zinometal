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

/**
 * Record a completed service. Side effects:
 *   1. Updates Forklift.currentHours if the service hours are higher.
 *   2. Updates ServiceSettings.lastServiceDate / lastServiceHours.
 *   3. Recomputes ServiceSettings.nextServiceDate / nextServiceHours from intervals.
 *   4. Keeps the full ServiceRecord history (no deletes).
 */
export async function createServiceRecord(
  forkliftId: string,
  formData: FormData,
) {
  const serviceDateStr = str(formData.get("serviceDate"));
  const serviceType = str(formData.get("serviceType"));
  if (!serviceDateStr) throw new Error("יש להזין תאריך טיפול");
  if (!serviceType) throw new Error("יש לבחור סוג טיפול");

  const serviceDate = new Date(serviceDateStr);
  if (isNaN(serviceDate.getTime())) throw new Error("תאריך לא תקין");

  const serviceHours = num(formData.get("serviceHours"));
  const cost = num(formData.get("cost"));

  await prisma.$transaction(async (tx) => {
    await tx.serviceRecord.create({
      data: {
        forkliftId,
        serviceDate,
        serviceHours,
        serviceType,
        workDescription: str(formData.get("workDescription")),
        partsReplaced: str(formData.get("partsReplaced")),
        supplier: str(formData.get("supplier")),
        cost,
        invoiceNumber: str(formData.get("invoiceNumber")),
        notes: str(formData.get("notes")),
      },
    });

    // Bump forklift currentHours if the reported service hours are higher.
    if (serviceHours !== null) {
      const f = await tx.forklift.findUnique({ where: { id: forkliftId } });
      if (f && serviceHours > f.currentHours) {
        await tx.forklift.update({
          where: { id: forkliftId },
          data: { currentHours: serviceHours },
        });
      }
    }

    // Update service settings: last + next.
    const settings = await tx.serviceSettings.findUnique({
      where: { forkliftId },
    });

    if (settings) {
      const nextDate = calculateNextServiceDate(
        serviceDate,
        settings.dateIntervalMonths,
      );
      const nextHours = calculateNextServiceHours(
        serviceHours,
        settings.hoursInterval,
      );
      await tx.serviceSettings.update({
        where: { forkliftId },
        data: {
          lastServiceDate: serviceDate,
          lastServiceHours: serviceHours ?? settings.lastServiceHours,
          nextServiceDate: nextDate ?? settings.nextServiceDate,
          nextServiceHours: nextHours ?? settings.nextServiceHours,
        },
      });
    }
  });

  revalidatePath("/");
  revalidatePath("/forklifts");
  revalidatePath(`/forklifts/${forkliftId}`);
  redirect(`/forklifts/${forkliftId}`);
}
