import Link from "next/link";
import { prisma } from "@/lib/db";
import ForkliftTable from "@/components/ForkliftTable";
import { FORKLIFT_STATUS, FUEL_TYPES } from "@/lib/constants";
import { getForkliftServiceStatus } from "@/lib/service-status";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  status?: string;
  fuelType?: string;
  location?: string;
  department?: string;
  sort?: string;
};

export default async function ForkliftsListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q, status, fuelType, location, department, sort } = searchParams;

  const forklifts = await prisma.forklift.findMany({
    where: {
      AND: [
        status ? { status } : {},
        fuelType ? { fuelType } : {},
        location ? { location: { contains: location } } : {},
        department ? { department: { contains: department } } : {},
        q
          ? {
              OR: [
                { internalNumber: { contains: q } },
                { description: { contains: q } },
                { manufacturer: { contains: q } },
                { model: { contains: q } },
                { serialNumber: { contains: q } },
              ],
            }
          : {},
      ],
    },
    include: { serviceSettings: true },
    orderBy: { internalNumber: "asc" },
  });

  // Optional sorts that need computed status:
  const enriched = forklifts.map((f) => ({
    f,
    s: getForkliftServiceStatus(f, f.serviceSettings),
  }));

  if (sort === "nextDate") {
    enriched.sort((a, b) => {
      const ad = a.f.serviceSettings?.nextServiceDate?.getTime() ?? Infinity;
      const bd = b.f.serviceSettings?.nextServiceDate?.getTime() ?? Infinity;
      return ad - bd;
    });
  } else if (sort === "urgency") {
    const order = { OVERDUE: 0, DUE: 1, UPCOMING: 2, OK: 3, UNDER_REPAIR: 4, INACTIVE: 5 };
    enriched.sort(
      (a, b) =>
        order[a.s.status] - order[b.s.status] ||
        (a.s.daysUntilService ?? 9999) - (b.s.daysUntilService ?? 9999),
    );
  }

  const sorted = enriched.map((e) => e.f);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">רשימת מלגזות</h1>
          <p className="text-sm text-slate-500">
            ניהול מלגזות, סינון וחיפוש
          </p>
        </div>
        <Link
          href="/forklifts/new"
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700"
        >
          + הוספת מלגזה
        </Link>
      </div>

      <form className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="חיפוש..."
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">כל הסטטוסים</option>
            {FORKLIFT_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            name="fuelType"
            defaultValue={fuelType ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">כל סוגי הדלק</option>
            {FUEL_TYPES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <input
            name="location"
            defaultValue={location ?? ""}
            placeholder="מיקום"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="department"
            defaultValue={department ?? ""}
            placeholder="מחלקה"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            name="sort"
            defaultValue={sort ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">מיון: מספר מלגזה</option>
            <option value="nextDate">מיון: תאריך טיפול הבא</option>
            <option value="urgency">מיון: דחיפות</option>
          </select>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Link
            href="/forklifts"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            איפוס
          </Link>
          <button
            type="submit"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
          >
            סנן
          </button>
        </div>
      </form>

      <ForkliftTable forklifts={sorted} />
    </div>
  );
}
