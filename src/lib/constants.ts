export const FUEL_TYPES = [
  { value: "ELECTRIC", label: "חשמלית" },
  { value: "DIESEL", label: "דיזל" },
  { value: "GASOLINE", label: "בנזין" },
  { value: "LPG", label: "גז (LPG)" },
  { value: "OTHER", label: "אחר" },
] as const;

export const FORKLIFT_STATUS = [
  { value: "ACTIVE", label: "פעילה" },
  { value: "INACTIVE", label: "לא פעילה" },
  { value: "SOLD", label: "נמכרה" },
  { value: "UNDER_REPAIR", label: "בתיקון" },
] as const;

export const TRACKING_MODES = [
  { value: "DATE", label: "לפי תאריך בלבד" },
  { value: "HOURS", label: "לפי שעות עבודה בלבד" },
  { value: "BOTH", label: "תאריך ושעות — המוקדם מביניהם" },
] as const;

export const SERVICE_TYPES = [
  "טיפול תקופתי",
  "בדיקת בטיחות",
  "תיקון תקלה",
  "החלפת שמנים",
  "בדיקת מצבר",
  "טיפול בלמים",
  "אחר",
] as const;

export const SERVICE_STATUS = {
  OK: { value: "OK", label: "תקין", color: "green" },
  UPCOMING: { value: "UPCOMING", label: "טיפול קרוב", color: "amber" },
  DUE: { value: "DUE", label: "טיפול נדרש", color: "orange" },
  OVERDUE: { value: "OVERDUE", label: "באיחור", color: "red" },
  INACTIVE: { value: "INACTIVE", label: "לא פעילה", color: "gray" },
  UNDER_REPAIR: { value: "UNDER_REPAIR", label: "בתיקון", color: "blue" },
} as const;

export type ServiceStatusKey = keyof typeof SERVICE_STATUS;

export function fuelTypeLabel(value: string): string {
  return FUEL_TYPES.find((f) => f.value === value)?.label ?? value;
}

export function forkliftStatusLabel(value: string): string {
  return FORKLIFT_STATUS.find((f) => f.value === value)?.label ?? value;
}

export function trackingModeLabel(value: string): string {
  return TRACKING_MODES.find((t) => t.value === value)?.label ?? value;
}
