# מעקב טיפולי מלגזות — Forklift Service Tracker

מערכת לניהול ומעקב טיפולים שוטפים של מלגזות במפעל. Hebrew/RTL UI מבוסס
Next.js 14 (App Router), Prisma + SQLite, ו־Tailwind CSS.

## תכונות עיקריות (Features)

- ניהול מלגזות: פרטים טכניים, מיקום, אחראי, סטטוס תפעולי, שעות עבודה
- הגדרת מרווחי טיפול לפי תאריך, שעות עבודה, או שילוב (המוקדם מביניהם)
- חישוב סטטוס דינמי לכל מלגזה: תקין / קרוב / נדרש / באיחור / לא פעיל / בתיקון
- רישום היסטוריית טיפולים והנעת חישוב הטיפול הבא אוטומטית
- דשבורד עם כרטיסי סיכום וטבלת מלגזות הדורשות תשומת לב
- מרכז התראות בתוך האפליקציה (in-app notifications)
- מנגנון Cron יומי (CLI + API endpoint) ליצירת תזכורות
- שלד Web Push מוכן להרחבה
- סינון, חיפוש ומיון לפי דחיפות/תאריך טיפול הבא
- נתוני דוגמה (seed) של 5 מלגזות שמכסות את כל מצבי הסטטוס

## לוח ברזל מקצועי

בתיקייה `steel-dashboard/` יש לוח בקרה נפרד למלאי ולהזמנות ספק של ברזל
מקצועי, שנבנה מדוחות פריוריטי. פרטים ב־`steel-dashboard/README.md`.

## דרישות

- Node.js 20+
- npm

## התקנה (Install)

```bash
npm install
cp .env.example .env
```

## אתחול מסד הנתונים (Migrate)

```bash
npm run db:push      # יצירת ה־schema במסד SQLite (prisma/dev.db)
# או, אם רוצים migrations מנוהלות:
npm run db:migrate
```

## הזרעת נתוני דוגמה (Seed)

```bash
npm run db:seed
```

מוסיף 5 מלגזות לדוגמה (חשמלית, דיזל, גז, באיחור, בתיקון) כדי שיהיה לאן
להיכנס מיד.

## הרצה מקומית (Run locally)

```bash
npm run dev
```

האפליקציה תרוץ ב־`http://localhost:3000`. ה־UI כולה בעברית עם תמיכת RTL מלאה.

## אתחול מחדש

```bash
npm run db:reset       # מוחק וקורא לסיד אוטומטית
```

## איך עובדת מערכת התזכורות

### לוגיקה

`src/lib/service-status.ts` מרכז את חישוב הסטטוס לכל מלגזה. הסטטוס מוגדר
על־פי:

- `nextServiceDate` — תאריך טיפול הבא
- `nextServiceHours` — שעות עבודה בטיפול הבא
- `reminderDaysBefore` — חלון תזכורת בימים לפני תאריך הטיפול
- `hoursReminderThreshold` — חלון תזכורת בשעות לפני שיגיע לקריטריון
- `trackingMode`: `DATE`, `HOURS`, או `BOTH` (במצב `BOTH` נבחר התנאי
  המוקדם/דחוף יותר)

הסטטוסים האפשריים:

| סטטוס | משמעות |
| --- | --- |
| `OK` | אין טיפול קרוב |
| `UPCOMING` | בחלון התזכורת |
| `DUE` | יום הטיפול הגיע / שעות הגיעו ליעד |
| `OVERDUE` | תאריך עבר או שעות חרגו |
| `INACTIVE` / `UNDER_REPAIR` | סטטוס תפעולי של המלגזה |

### יצירת התראות

`src/lib/notifications.ts` -> `generateServiceNotifications()` סורק את כל
המלגזות הפעילות עם תזכורות מופעלות, מחשב את הסטטוס עבור כל אחת, ויוצר רשומת
`Notification` במסד הנתונים אם:

- הסטטוס הוא `UPCOMING`, `DUE` או `OVERDUE`
- ולא נוצרה התראה מאותו סוג עבור אותה מלגזה במהלך חלון ה־de-dupe
  (`repeatOverdueReminderDays` עבור `OVERDUE`, או יום אחד אחרת)

ההתראות מוצגות במרכז ההתראות (`/notifications`) ובסמן הספירה ב־Navbar.

### הפעלה תזמונית (Cron)

יש שתי דרכים מקבילות להפעיל את הסריקה:

1. **CLI** (מומלץ ל־cron מקומי / systemd / GitHub Actions):

   ```bash
   npm run cron:check
   ```

   דוגמת crontab (פעם ביום בשעה 08:00):

   ```cron
   0 8 * * *  cd /opt/forklift-service-tracker && /usr/bin/npm run cron:check >> /var/log/forklift-cron.log 2>&1
   ```

2. **HTTP endpoint** (מתאים ל־Vercel Cron / cron-job.org):

   ```bash
   curl -X POST \
     -H "x-cron-secret: $CRON_SECRET" \
     https://your-domain.com/api/cron/notifications
   ```

   ה־endpoint מוגדר ב־`src/app/api/cron/notifications/route.ts`.
   ערך ה־secret נשמר ב־`CRON_SECRET` ב־`.env`.

ניתן גם להפעיל בדיקה ידנית מהממשק: `/notifications` → "הפעל בדיקה עכשיו".

## הגדרת ערוצי התראה

מסך `/settings` כולל:

- ימי תזכורת ברירת מחדל לפני טיפול
- תזכורת שנייה אופציונלית
- חזרה על תזכורת באיחור כל X ימים
- שעת בדיקה יומית
- מתגי הפעלה לכל ערוץ: in-app, email, Web Push

ניתן לדרוס את הערכים פר־מלגזה במסך **הגדרות טיפול** של כל מלגזה.

## Web Push (התראות דפדפן)

`src/lib/push-notifications.ts` הוא נקודת ההרחבה לתכלול Web Push. כדי לממש:

1. הפק VAPID keys: `npx web-push generate-vapid-keys`.
2. הוסף ל־`.env`:
   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:admin@example.com
   ```
3. הוסף מודל `PushSubscription` ל־Prisma ושמור מנויים מהלקוח אחרי קבלת
   אישור מהמשתמש.
4. ב־`sendPushNotification()` שלוף את המנויים ושלח עם `web-push`.
5. הוסף `public/sw.js` המטפל באירוע `push` ומציג notification.

עד אז — התראות in-app פועלות במלואן, ושלד הקוד מסומן ב־`TODO(push)`.

## מבנה הפרוייקט

```
src/
  app/
    page.tsx                       דשבורד
    forklifts/
      page.tsx                     רשימת מלגזות (חיפוש/סינון/מיון)
      new/                         הוספת מלגזה
      [id]/                        פרטי מלגזה
        edit/                      עריכת מלגזה
        settings/                  הגדרות טיפול
        service/new/               רישום טיפול
    notifications/                 מרכז התראות
    settings/                      הגדרות מערכת
    api/cron/notifications/        endpoint לקרון
    actions/                       Server actions (forklifts, services, notifications)
  components/
    Navbar, StatusBadge, SummaryCard, ForkliftTable,
    ForkliftForm, ServiceRecordForm
  lib/
    db.ts                          Prisma singleton
    service-status.ts              חישוב סטטוס מרכזי
    notifications.ts               יצירת התראות
    push-notifications.ts          שלד ל־Web Push
    date-utils.ts                  פורמטים, ימים מהיום
    constants.ts                   תוויות עברית, סוגי דלק, סטטוסים
prisma/
  schema.prisma                    סכמת מסד הנתונים
  seed.ts                          נתוני דוגמה
scripts/
  check-reminders.ts               CLI לבדיקת תזכורות (cron)
```

## ולידציה ולוגיקה עסקית

- מספר מלגזה ותיאור הם שדות חובה (`createForklift` ב־
  `src/app/actions/forklifts.ts`).
- שעות עבודה לא יכולות להיות שליליות.
- שנת ייצור חייבת להיות בין 1950 לשנה הנוכחית + 1.
- חישוב טיפול הבא אוטומטי בעת רישום טיפול — `createServiceRecord` ב־
  `src/app/actions/services.ts`.
- חישוב הסטטוס מרוכז ב־`getForkliftServiceStatus` ומשמש את:
  - דשבורד (`src/app/page.tsx`)
  - רשימת מלגזות (`src/components/ForkliftTable.tsx`)
  - מסך פרטי מלגזה (`src/app/forklifts/[id]/page.tsx`)
  - יצירת התראות (`src/lib/notifications.ts`)

## פיצ&apos;רים עתידיים שהמבנה כבר מוכן עבורם

- ייצוא ל־Excel (ניתן להוסיף route שמייצא את `ForkliftTable`)
- דוחות PDF (Puppeteer / pdfkit)
- העלאת קבצים — מודל `Attachment` קיים בסכמה
- הרשאות משתמשים — אין כרגע auth, אבל אפשר להוסיף NextAuth
- אתרים/מפעלים מרובים — להרחיב את `Forklift` עם `siteId`
- ממשק נייד — Tailwind כבר רספונסיבי
- תזכורות בוואטסאפ — להחליף/להרחיב את `sendPushNotification`
- אינטגרציה עם יומן חיצוני — generate iCal feed לפי `nextServiceDate`

## שגיאות נפוצות

- **`Module @prisma/client did not initialize yet`** — הרצת `npm run db:push`
  לפני `npm run dev`.
- **תאריכים מציגים `—`** — לא הוגדרו פרמטרי טיפול. כנס למסך "הגדרות טיפול".
- **התראות לא נוצרות** — וודא ש־`remindersEnabled` פעיל ברמה הגלובלית ובמלגזה,
  ושהוגדרו `dateIntervalMonths`/`hoursInterval`.
