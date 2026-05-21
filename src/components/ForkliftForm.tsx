import type { Forklift, ServiceSettings } from "@prisma/client";
import { FORKLIFT_STATUS, FUEL_TYPES, TRACKING_MODES } from "@/lib/constants";

type Props = {
  action: (formData: FormData) => void;
  initial?: Forklift & { serviceSettings?: ServiceSettings | null };
  submitLabel: string;
  showServiceSettings?: boolean;
};

function inputCls(extra = "") {
  return `block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${extra}`;
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="mr-1 text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function dateInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  const iso = date.toISOString();
  return iso.slice(0, 10);
}

export default function ForkliftForm({
  action,
  initial,
  submitLabel,
  showServiceSettings = true,
}: Props) {
  const s = initial?.serviceSettings;
  return (
    <form action={action} className="space-y-8">
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">פרטי מלגזה</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="מספר מלגזה" required>
            <input
              name="internalNumber"
              required
              defaultValue={initial?.internalNumber ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="תיאור / שם" required>
            <input
              name="description"
              required
              defaultValue={initial?.description ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="יצרן">
            <input
              name="manufacturer"
              defaultValue={initial?.manufacturer ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="דגם">
            <input
              name="model"
              defaultValue={initial?.model ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="מספר שלדה / סידורי">
            <input
              name="serialNumber"
              defaultValue={initial?.serialNumber ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="שנת ייצור">
            <input
              type="number"
              name="year"
              min={1950}
              max={new Date().getFullYear() + 1}
              defaultValue={initial?.year ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="סוג דלק">
            <select
              name="fuelType"
              defaultValue={initial?.fuelType ?? "ELECTRIC"}
              className={inputCls()}
            >
              {FUEL_TYPES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="מיקום במפעל">
            <input
              name="location"
              defaultValue={initial?.location ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="מחלקה">
            <input
              name="department"
              defaultValue={initial?.department ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="אחראי">
            <input
              name="responsiblePerson"
              defaultValue={initial?.responsiblePerson ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="סטטוס">
            <select
              name="status"
              defaultValue={initial?.status ?? "ACTIVE"}
              className={inputCls()}
            >
              {FORKLIFT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="שעות עבודה נוכחיות" hint="מספר בלבד">
            <input
              type="number"
              step="0.1"
              min="0"
              name="currentHours"
              defaultValue={initial?.currentHours ?? 0}
              className={inputCls()}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="הערות">
            <textarea
              name="notes"
              rows={3}
              defaultValue={initial?.notes ?? ""}
              className={inputCls()}
            />
          </Field>
        </div>
      </section>

      {showServiceSettings && (
        <section className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-slate-800">
            הגדרות טיפול
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            ניתן לעדכן בהמשך גם ממסך הפרטים של המלגזה.
          </p>
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
            <Field label="מרווח טיפול (חודשים)">
              <input
                type="number"
                min="0"
                name="dateIntervalMonths"
                defaultValue={s?.dateIntervalMonths ?? ""}
                className={inputCls()}
              />
            </Field>
            <Field label="מרווח טיפול (שעות)">
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
            <Field label="ימים לפני טיפול להתראה">
              <input
                type="number"
                min="0"
                name="reminderDaysBefore"
                defaultValue={s?.reminderDaysBefore ?? 14}
                className={inputCls()}
              />
            </Field>
          </div>
        </section>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
