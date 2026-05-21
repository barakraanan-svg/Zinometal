import Link from "next/link";
import { prisma } from "@/lib/db";
import { getForkliftServiceStatus } from "@/lib/service-status";
import SummaryCard from "@/components/SummaryCard";
import ForkliftTable from "@/components/ForkliftTable";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const forklifts = await prisma.forklift.findMany({
    include: { serviceSettings: true },
    orderBy: { internalNumber: "asc" },
  });

  let total = 0;
  let ok = 0;
  let upcoming = 0;
  let overdue = 0;
  let underRepair = 0;
  let active = 0;

  const enriched = forklifts.map((f) => {
    total++;
    if (f.status === "ACTIVE") active++;
    if (f.status === "UNDER_REPAIR") underRepair++;
    const s = getForkliftServiceStatus(f, f.serviceSettings);
    if (s.status === "OK") ok++;
    if (s.status === "UPCOMING" || s.status === "DUE") upcoming++;
    if (s.status === "OVERDUE") overdue++;
    return { forklift: f, statusInfo: s };
  });

  // Forklifts that need attention: OVERDUE first, then DUE, then UPCOMING.
  const priority: Record<string, number> = {
    OVERDUE: 0,
    DUE: 1,
    UPCOMING: 2,
    OK: 3,
    UNDER_REPAIR: 4,
    INACTIVE: 5,
  };
  const needAttention = enriched
    .filter((e) =>
      ["OVERDUE", "DUE", "UPCOMING", "UNDER_REPAIR"].includes(
        e.statusInfo.status,
      ),
    )
    .sort(
      (a, b) =>
        priority[a.statusInfo.status] - priority[b.statusInfo.status] ||
        (a.statusInfo.daysUntilService ?? 0) -
          (b.statusInfo.daysUntilService ?? 0),
    )
    .map((e) => e.forklift);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">דשבורד</h1>
          <p className="text-sm text-slate-500">
            תמונת מצב עדכנית של מצבת המלגזות והטיפולים
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/forklifts/new"
            className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700"
          >
            + הוספת מלגזה
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <SummaryCard title='סה"כ מלגזות' value={total} />
        <SummaryCard title="מלגזות פעילות" value={active} tone="info" />
        <SummaryCard title="תקינות" value={ok} tone="good" />
        <SummaryCard title="טיפולים קרובים" value={upcoming} tone="warn" />
        <SummaryCard title="טיפולים באיחור" value={overdue} tone="bad" />
      </div>

      {underRepair > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {underRepair} מלגזות בתיקון כרגע
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">
          מלגזות לטיפול מיידי
        </h2>
        <ForkliftTable
          forklifts={needAttention}
          emptyMessage="אין מלגזות הדורשות תשומת לב — הכל תקין 👍"
        />
      </section>
    </div>
  );
}
