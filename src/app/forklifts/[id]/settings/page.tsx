import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TRACKING_MODES } from "@/lib/constants";
import { updateServiceSettings } from "@/app/actions/forklifts";

function inputCls() {
  return "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function dateInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  const iso = new Date(d).toISOString();
  return iso.slice(0, 10);
}

export default async function ServiceSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const f = await prisma.forklift.findUnique({
    where: { id: params.id },
    include: { serviceSettings: true },
  });
  if (!f) notFound();

  const s = f.serviceSettings;
  const action = updateServiceSettings.bind(null, f.id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">
        הגדרות טיפול — מלגזה {f.internalNumber}
      </h1>
      <p className="text-sm text-slate-500">
        הגדרת מרווחי טיפול ותזכורות עבור המלגזה הזו. ניתן להגדיר לפי תאריך, לפי
        שעות, או שילוב — בו ייקבע התנאי המוקדם יותר.
      </p>

      <form action={action} className="space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="מעקב לפי">
            <select
              name="trackingMode"
              defaultValue={s?.trackingMode ?? "BOTH"}
              className={inputCls()}
            >
              {TRACKING_MODES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="מרווח לפי תאריך (חודשים)" hint="לדוגמה: 3, 6, 12">
            <input
              type="number"
              min="0"
              name="dateIntervalMonths"
              defaultValue={s?.dateIntervalMonths ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="מרווח לפי שעות עבודה" hint="לדוגמה: 250, 500, 1000">
            <input
              type="number"
              step="1"
              min="0"
              name="hoursInterval"
              defaultValue={s?.hoursInterval ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="תאריך טיפול אחרון">
            <input
              type="date"
              name="lastServiceDate"
              defaultValue={dateInputValue(s?.lastServiceDate)}
              className={inputCls()}
            />
          </Field>
          <Field label="שעות בטיפול אחרון">
            <input
              type="number"
              step="0.1"
              min="0"
              name="lastServiceHours"
              defaultValue={s?.lastServiceHours ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field
            label="עקיפת תאריך טיפול הבא (אופציונלי)"
            hint="ריק = יחושב אוטומטית"
          >
            <input
              type="date"
              name="nextServiceDate"
              defaultValue={dateInputValue(s?.nextServiceDate)}
              className={inputCls()}
            />
          </Field>
          <Field
            label="עקיפת שעות טיפול הבא (אופציונלי)"
            hint="ריק = יחושב אוטומטית"
          >
            <input
              type="number"
              step="0.1"
              min="0"
              name="nextServiceHours"
              defaultValue={s?.nextServiceHours ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="ימי תזכורת ראשונה לפני טיפול">
            <input
              type="number"
              min="0"
              name="reminderDaysBefore"
              defaultValue={s?.reminderDaysBefore ?? 14}
              className={inputCls()}
            />
          </Field>
          <Field label="תזכורת שנייה (ימים לפני, אופציונלי)">
            <input
              type="number"
              min="0"
              name="secondReminderDaysBefore"
              defaultValue={s?.secondReminderDaysBefore ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="חזרה על תזכורת באיחור כל X ימים (אופציונלי)">
            <input
              type="number"
              min="0"
              name="repeatOverdueReminderDays"
              defaultValue={s?.repeatOverdueReminderDays ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field
            label="סף שעות לפני טיפול לצורך התראה"
            hint="לדוגמה: 50 שעות לפני שמגיע ליעד"
          >
            <input
              type="number"
              step="1"
              min="0"
              name="hoursReminderThreshold"
              defaultValue={s?.hoursReminderThreshold ?? ""}
              className={inputCls()}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="remindersEnabled"
            defaultChecked={s?.remindersEnabled ?? true}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm font-medium text-slate-700">
            תזכורות מופעלות עבור מלגזה זו
          </span>
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700"
          >
            שמור הגדרות
          </button>
        </div>
      </form>
    </div>
  );
}
