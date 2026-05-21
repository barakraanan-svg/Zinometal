import { SERVICE_TYPES } from "@/lib/constants";

function inputCls() {
  return "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="mr-1 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

export default function ServiceRecordForm({
  action,
  defaultHours,
  defaultDate,
}: {
  action: (formData: FormData) => void;
  defaultHours?: number;
  defaultDate?: string;
}) {
  const today = defaultDate ?? new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="space-y-6">
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="תאריך טיפול" required>
            <input
              type="date"
              name="serviceDate"
              defaultValue={today}
              required
              className={inputCls()}
            />
          </Field>
          <Field label="שעות עבודה בעת הטיפול">
            <input
              type="number"
              step="0.1"
              min="0"
              name="serviceHours"
              defaultValue={defaultHours ?? ""}
              className={inputCls()}
            />
          </Field>
          <Field label="סוג טיפול" required>
            <select name="serviceType" defaultValue="טיפול תקופתי" required className={inputCls()}>
              {SERVICE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ספק / מוסך">
            <input name="supplier" className={inputCls()} />
          </Field>
          <Field label="עלות (₪)">
            <input
              type="number"
              step="0.01"
              min="0"
              name="cost"
              className={inputCls()}
            />
          </Field>
          <Field label="מספר חשבונית">
            <input name="invoiceNumber" className={inputCls()} />
          </Field>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="תיאור העבודה">
            <textarea name="workDescription" rows={3} className={inputCls()} />
          </Field>
          <Field label="חלקים שהוחלפו">
            <textarea name="partsReplaced" rows={2} className={inputCls()} />
          </Field>
          <Field label="הערות">
            <textarea name="notes" rows={2} className={inputCls()} />
          </Field>
        </div>
      </section>
      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700"
        >
          שמור טיפול
        </button>
      </div>
    </form>
  );
}
