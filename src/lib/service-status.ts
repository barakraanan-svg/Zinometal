/**
 * Centralised service status calculation.
 *
 * Status keys:
 *   OK         — no upcoming service in range
 *   UPCOMING   — within reminderDaysBefore (or within hoursReminderThreshold)
 *   DUE        — due today (date passed or hours reached, but not yet over by much)
 *   OVERDUE    — date is in the past OR hours exceeded next-service hours
 *   INACTIVE / UNDER_REPAIR — derived from forklift.status
 *
 * If trackingMode = BOTH, the *more urgent* (earlier) condition wins.
 */

import { addMonths, differenceInCalendarDays } from "date-fns";
import type { Forklift, ServiceSettings } from "@prisma/client";
import type { ServiceStatusKey } from "./constants";

export interface ServiceStatusResult {
  status: ServiceStatusKey;
  daysUntilService: number | null;
  hoursUntilService: number | null;
  message: string;
  // Underlying reason flags for debugging / UI
  isOverdueByDate: boolean;
  isOverdueByHours: boolean;
  isUpcomingByDate: boolean;
  isUpcomingByHours: boolean;
}

export function calculateNextServiceDate(
  lastServiceDate: Date | null | undefined,
  intervalMonths: number | null | undefined,
): Date | null {
  if (!lastServiceDate || !intervalMonths || intervalMonths <= 0) return null;
  return addMonths(new Date(lastServiceDate), intervalMonths);
}

export function calculateNextServiceHours(
  lastServiceHours: number | null | undefined,
  intervalHours: number | null | undefined,
): number | null {
  if (
    lastServiceHours === null ||
    lastServiceHours === undefined ||
    !intervalHours ||
    intervalHours <= 0
  )
    return null;
  return lastServiceHours + intervalHours;
}

export function getDaysUntilService(
  nextServiceDate: Date | string | null | undefined,
): number | null {
  if (!nextServiceDate) return null;
  const d =
    typeof nextServiceDate === "string"
      ? new Date(nextServiceDate)
      : nextServiceDate;
  if (isNaN(d.getTime())) return null;
  return differenceInCalendarDays(d, new Date());
}

export function isServiceDueByHours(
  currentHours: number,
  nextServiceHours: number | null | undefined,
): boolean {
  if (nextServiceHours === null || nextServiceHours === undefined) return false;
  return currentHours >= nextServiceHours;
}

export function isServiceUpcomingByDate(
  nextServiceDate: Date | string | null | undefined,
  reminderDaysBefore: number,
): boolean {
  const days = getDaysUntilService(nextServiceDate);
  if (days === null) return false;
  return days >= 0 && days <= reminderDaysBefore;
}

export function isServiceUpcomingByHours(
  currentHours: number,
  nextServiceHours: number | null | undefined,
  hoursThreshold: number | null | undefined,
): boolean {
  if (
    nextServiceHours === null ||
    nextServiceHours === undefined ||
    !hoursThreshold ||
    hoursThreshold <= 0
  )
    return false;
  const remaining = nextServiceHours - currentHours;
  return remaining >= 0 && remaining <= hoursThreshold;
}

/**
 * Returns the most urgent status given the forklift's operating status and its
 * service settings (date-based, hours-based, or both — whichever is sooner).
 */
export function getForkliftServiceStatus(
  forklift: Pick<Forklift, "status" | "currentHours">,
  settings: ServiceSettings | null | undefined,
): ServiceStatusResult {
  // Operating status overrides service status.
  if (forklift.status === "INACTIVE" || forklift.status === "SOLD") {
    return {
      status: "INACTIVE",
      daysUntilService: null,
      hoursUntilService: null,
      message: "לא פעילה",
      isOverdueByDate: false,
      isOverdueByHours: false,
      isUpcomingByDate: false,
      isUpcomingByHours: false,
    };
  }

  if (forklift.status === "UNDER_REPAIR") {
    return {
      status: "UNDER_REPAIR",
      daysUntilService: null,
      hoursUntilService: null,
      message: "בתיקון",
      isOverdueByDate: false,
      isOverdueByHours: false,
      isUpcomingByDate: false,
      isUpcomingByHours: false,
    };
  }

  if (!settings) {
    return {
      status: "OK",
      daysUntilService: null,
      hoursUntilService: null,
      message: "לא הוגדר טיפול",
      isOverdueByDate: false,
      isOverdueByHours: false,
      isUpcomingByDate: false,
      isUpcomingByHours: false,
    };
  }

  const trackByDate =
    settings.trackingMode === "DATE" || settings.trackingMode === "BOTH";
  const trackByHours =
    settings.trackingMode === "HOURS" || settings.trackingMode === "BOTH";

  const daysUntil = trackByDate
    ? getDaysUntilService(settings.nextServiceDate)
    : null;
  const hoursUntil =
    trackByHours && settings.nextServiceHours !== null && settings.nextServiceHours !== undefined
      ? settings.nextServiceHours - forklift.currentHours
      : null;

  const isOverdueByDate = trackByDate && daysUntil !== null && daysUntil < 0;
  const isOverdueByHours =
    trackByHours && hoursUntil !== null && hoursUntil < 0;

  const isDueByDate = trackByDate && daysUntil !== null && daysUntil === 0;
  const isDueByHours =
    trackByHours &&
    hoursUntil !== null &&
    hoursUntil <= 0 &&
    !isOverdueByHours;

  const isUpcomingByDate =
    trackByDate &&
    daysUntil !== null &&
    daysUntil > 0 &&
    daysUntil <= settings.reminderDaysBefore;

  const isUpcomingByHours = isServiceUpcomingByHours(
    forklift.currentHours,
    settings.nextServiceHours,
    settings.hoursReminderThreshold,
  );

  // Priority: OVERDUE > DUE > UPCOMING > OK
  let status: ServiceStatusKey = "OK";
  if (isOverdueByDate || isOverdueByHours) status = "OVERDUE";
  else if (isDueByDate || isDueByHours) status = "DUE";
  else if (isUpcomingByDate || isUpcomingByHours) status = "UPCOMING";

  const message = buildStatusMessage({
    status,
    daysUntil,
    hoursUntil,
  });

  return {
    status,
    daysUntilService: daysUntil,
    hoursUntilService: hoursUntil,
    message,
    isOverdueByDate,
    isOverdueByHours,
    isUpcomingByDate,
    isUpcomingByHours,
  };
}

function buildStatusMessage(args: {
  status: ServiceStatusKey;
  daysUntil: number | null;
  hoursUntil: number | null;
}): string {
  const { status, daysUntil, hoursUntil } = args;
  if (status === "OK") return "תקין";

  const parts: string[] = [];
  if (daysUntil !== null) {
    if (daysUntil < 0) parts.push(`באיחור של ${Math.abs(daysUntil)} ימים`);
    else if (daysUntil === 0) parts.push("טיפול היום");
    else parts.push(`טיפול בעוד ${daysUntil} ימים`);
  }
  if (hoursUntil !== null) {
    if (hoursUntil < 0)
      parts.push(`חריגה של ${Math.abs(Math.round(hoursUntil))} שעות`);
    else parts.push(`נותרו ${Math.round(hoursUntil)} שעות לטיפול`);
  }
  return parts.join(" · ") || "טיפול נדרש";
}
