import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/date-utils";
import {
  markAllNotificationsRead,
  markNotificationRead,
  runReminderCheckNow,
} from "@/app/actions/notifications";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  UPCOMING: "טיפול קרוב",
  DUE: "טיפול נדרש",
  OVERDUE: "באיחור",
};
const TYPE_COLOR: Record<string, string> = {
  UPCOMING: "bg-amber-100 text-amber-800",
  DUE: "bg-orange-100 text-orange-900",
  OVERDUE: "bg-red-100 text-red-800",
};

export default async function NotificationsPage() {
  const notifications = await prisma.notification.findMany({
    include: { forklift: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">מרכז התראות</h1>
          <p className="text-sm text-slate-500">
            התראות בתוך האפליקציה על טיפולים קרובים ובאיחור
          </p>
        </div>
        <div className="flex gap-2">
          <form action={runReminderCheckNow}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              הפעל בדיקה עכשיו
            </button>
          </form>
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
            >
              סמן הכל כנקרא
            </button>
          </form>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          אין התראות כרגע. ניתן להפעיל בדיקה ידנית או להמתין לסריקה היומית.
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const markRead = markNotificationRead.bind(null, n.id);
            return (
              <li
                key={n.id}
                className={`rounded-lg border p-4 shadow-sm transition ${
                  n.isRead ? "bg-white" : "bg-amber-50 border-amber-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_COLOR[n.type]}`}
                      >
                        {TYPE_LABEL[n.type] ?? n.type}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">
                        {n.title}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{n.message}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(n.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 text-left">
                    <Link
                      href={`/forklifts/${n.forkliftId}`}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      פתח מלגזה
                    </Link>
                    {!n.isRead && (
                      <form action={markRead}>
                        <button
                          type="submit"
                          className="text-xs text-slate-600 hover:underline"
                        >
                          סמן כנקרא
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
