import Link from "next/link";
import type { Forklift, ServiceSettings } from "@prisma/client";
import StatusBadge from "./StatusBadge";
import { getForkliftServiceStatus } from "@/lib/service-status";
import { formatDate } from "@/lib/date-utils";
import { fuelTypeLabel } from "@/lib/constants";

export type ForkliftWithSettings = Forklift & {
  serviceSettings: ServiceSettings | null;
};

export default function ForkliftTable({
  forklifts,
  emptyMessage = "לא נמצאו מלגזות",
}: {
  forklifts: ForkliftWithSettings[];
  emptyMessage?: string;
}) {
  if (forklifts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2">מס׳</th>
            <th className="px-3 py-2">תיאור</th>
            <th className="px-3 py-2">מיקום</th>
            <th className="px-3 py-2">דלק</th>
            <th className="px-3 py-2">טיפול אחרון</th>
            <th className="px-3 py-2">טיפול הבא</th>
            <th className="px-3 py-2">שעות נוכחיות</th>
            <th className="px-3 py-2">שעות לטיפול</th>
            <th className="px-3 py-2">סטטוס</th>
            <th className="px-3 py-2">פעולות</th>
          </tr>
        </thead>
        <tbody className="table-row-hover divide-y divide-slate-100">
          {forklifts.map((f) => {
            const status = getForkliftServiceStatus(f, f.serviceSettings);
            return (
              <tr key={f.id}>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">
                  {f.internalNumber}
                </td>
                <td className="px-3 py-2 text-slate-800">{f.description}</td>
                <td className="px-3 py-2 text-slate-600">{f.location ?? "—"}</td>
                <td className="px-3 py-2 text-slate-600">
                  {fuelTypeLabel(f.fuelType)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                  {formatDate(f.serviceSettings?.lastServiceDate)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                  {formatDate(f.serviceSettings?.nextServiceDate)}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {Math.round(f.currentHours)}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {f.serviceSettings?.nextServiceHours != null
                    ? Math.round(f.serviceSettings.nextServiceHours)
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <StatusBadge status={status.status} />
                    <span className="text-xs text-slate-500">
                      {status.message}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2 text-xs">
                    <Link
                      className="text-brand-600 hover:underline"
                      href={`/forklifts/${f.id}`}
                    >
                      פרטים
                    </Link>
                    <Link
                      className="text-brand-600 hover:underline"
                      href={`/forklifts/${f.id}/service/new`}
                    >
                      + טיפול
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
