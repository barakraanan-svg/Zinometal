import { prisma } from "@/lib/db";
import { updateAppSettings } from "@/app/actions/notifications";

function inputCls() {
  return "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
}

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s =
    (await prisma.appSettings.findUnique({ where: { id: "global" } })) ?? {
      defaultReminderDaysBefore: 14,
      defaultSecondReminderDays: null,
      defaultRepeatOverdueDays: null,
      dailyCheckTime: "08:00",
      remindersEnabled: true,
      enableInApp: true,
      enableEmail: false,
      enablePush: false,
    };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">הגדרות מערכת</h1>
      <p className="text-sm text-slate-500">
        ברירת מחדל לתזכורות וערוצי התראה. הגדרות אלה ישפיעו על מלגזות חדשות; ניתן
        לדרוס פר־מלגזה.
      </p>

      <form
        action={updateAppSettings}
        className="space-y-4 rounded-lg border bg-white p-6 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              ימי תזכורת ברירת מחדל לפני טיפול
            </span>
            <input
              type="number"
              min="0"
              name="defaultReminderDaysBefore"
              defaultValue={s.defaultReminderDaysBefore}
              className={inputCls()}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              תזכורת שנייה (ימים, אופציונלי)
            </span>
            <input
              type="number"
              min="0"
              name="defaultSecondReminderDays"
              defaultValue={s.defaultSecondReminderDays ?? ""}
              className={inputCls()}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              חזרה על תזכורת איחור כל X ימים
            </span>
            <input
              type="number"
              min="0"
              name="defaultRepeatOverdueDays"
              defaultValue={s.defaultRepeatOverdueDays ?? ""}
              className={inputCls()}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              שעת בדיקה יומית
            </span>
            <input
              type="time"
              name="dailyCheckTime"
              defaultValue={s.dailyCheckTime}
              className={inputCls()}
            />
            <span className="mt-1 block text-xs text-slate-500">
              משמש את הקרון המקרוצדל. ראה README כיצד לחבר ל־cron.
            </span>
          </label>
        </div>

        <fieldset className="rounded-md border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">
            ערוצי התראה
          </legend>
          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="remindersEnabled"
                defaultChecked={s.remindersEnabled}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">
                תזכורות פעילות באופן כללי
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="enableInApp"
                defaultChecked={s.enableInApp}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">
                התראות בתוך האפליקציה (תמיד זמין)
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="enableEmail"
                defaultChecked={s.enableEmail}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">
                התראות בדוא&quot;ל (דורש הגדרה בצד שרת)
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="enablePush"
                defaultChecked={s.enablePush}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">
                Web Push בדפדפן (דורש VAPID + Service Worker)
              </span>
            </label>
          </div>
        </fieldset>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700"
          >
            שמור
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <div className="font-semibold">איך פועלת מערכת התזכורות?</div>
        <ul className="mt-2 list-inside list-disc space-y-1 text-blue-900">
          <li>
            סקריפט יומי (cron) מריץ <code>npm run cron:check</code> בשעה שהוגדרה
            ובודק את כל המלגזות הפעילות.
          </li>
          <li>
            לחלופין ניתן לפנות ל־<code>POST /api/cron/notifications</code> עם
            כותרת <code>x-cron-secret</code>.
          </li>
          <li>
            התראות נוצרות כשהטיפול בחלון הימים שהוגדר, כשהשעות מתקרבות לסף, או
            כשהטיפול באיחור.
          </li>
          <li>
            התראות בדפדפן (Web Push) — כשלד הקוד קיים תחת{" "}
            <code>src/lib/push-notifications.ts</code>; יש להגדיר VAPID ולממש
            Service Worker.
          </li>
        </ul>
      </div>
    </div>
  );
}
