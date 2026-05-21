import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getForkliftServiceStatus } from "@/lib/service-status";
import { formatDate } from "@/lib/date-utils";
import StatusBadge from "@/components/StatusBadge";
import {
  forkliftStatusLabel,
  fuelTypeLabel,
  trackingModeLabel,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-800">{value || "—"}</div>
    </div>
  );
}

export default async function ForkliftDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const f = await prisma.forklift.findUnique({
    where: { id: params.id },
    include: {
      serviceSettings: true,
      serviceRecords: { orderBy: { serviceDate: "desc" } },
    },
  });
  if (!f) notFound();

  const status = getForkliftServiceStatus(f, f.serviceSettings);
  const s = f.serviceSettings;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">
              מלגזה {f.internalNumber}
            </h1>
            <StatusBadge status={status.status} />
          </div>
          <p className="text-sm text-slate-500">{f.description}</p>
          <p className="mt-1 text-xs text-slate-500">{status.message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/forklifts/${f.id}/service/new`}
            className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700"
          >
            + רישום טיפול
          </Link>
          <Link
            href={`/forklifts/${f.id}/edit`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            עריכת מלגזה
          </Link>
          <Link
            href={`/forklifts/${f.id}/settings`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            הגדרות טיפול
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-800">
            פרטים טכניים
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Detail label="יצרן" value={f.manufacturer} />
            <Detail label="דגם" value={f.model} />
            <Detail label="מספר שלדה" value={f.serialNumber} />
            <Detail label="שנת ייצור" value={f.year} />
            <Detail label="סוג דלק" value={fuelTypeLabel(f.fuelType)} />
            <Detail label="סטטוס" value={forkliftStatusLabel(f.status)} />
            <Detail label="מיקום" value={f.location} />
            <Detail label="מחלקה" value={f.department} />
            <Detail label="אחראי" value={f.responsiblePerson} />
            <Detail
              label="שעות עבודה נוכחיות"
              value={Math.round(f.currentHours)}
            />
          </div>
          {f.notes && (
            <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <div className="mb-1 text-xs text-slate-500">הערות</div>
              {f.notes}
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-800">
            הגדרות וטיפול
          </h2>
          {s ? (
            <div className="grid grid-cols-2 gap-4">
              <Detail label="מעקב לפי" value={trackingModeLabel(s.trackingMode)} />
              <Detail
                label="מרווח (חודשים)"
                value={s.dateIntervalMonths ?? "—"}
              />
              <Detail
                label="מרווח (שעות)"
                value={s.hoursInterval ?? "—"}
              />
              <Detail
                label="ימי תזכורת לפני"
                value={s.reminderDaysBefore}
              />
              <Detail
                label="טיפול אחרון"
                value={formatDate(s.lastServiceDate)}
              />
              <Detail
                label="שעות בטיפול אחרון"
                value={s.lastServiceHours ?? "—"}
              />
              <Detail
                label="טיפול הבא — תאריך"
                value={formatDate(s.nextServiceDate)}
              />
              <Detail
                label="טיפול הבא — שעות"
                value={s.nextServiceHours ?? "—"}
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              עוד לא הוגדרו פרמטרי טיפול.{" "}
              <Link
                href={`/forklifts/${f.id}/settings`}
                className="text-brand-600 underline"
              >
                הגדר עכשיו
              </Link>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">
            היסטוריית טיפולים ({f.serviceRecords.length})
          </h2>
          <Link
            href={`/forklifts/${f.id}/service/new`}
            className="text-sm text-brand-600 hover:underline"
          >
            + הוסף רישום
          </Link>
        </div>
        {f.serviceRecords.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            לא נרשמו טיפולים עדיין
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">תאריך</th>
                  <th className="px-3 py-2">סוג טיפול</th>
                  <th className="px-3 py-2">שעות</th>
                  <th className="px-3 py-2">תיאור</th>
                  <th className="px-3 py-2">חלקים</th>
                  <th className="px-3 py-2">ספק</th>
                  <th className="px-3 py-2">עלות</th>
                  <th className="px-3 py-2">חשבונית</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {f.serviceRecords.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">
                      {formatDate(r.serviceDate)}
                    </td>
                    <td className="px-3 py-2">{r.serviceType}</td>
                    <td className="px-3 py-2">{r.serviceHours ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.workDescription ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.partsReplaced ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.supplier ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.cost != null ? `₪${r.cost.toLocaleString("he-IL")}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.invoiceNumber ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
