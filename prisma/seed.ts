import { PrismaClient } from "@prisma/client";
import { addDays, addMonths, subDays, subMonths } from "date-fns";

const prisma = new PrismaClient();

/**
 * Seeds five sample forklifts that exercise the main status branches:
 *   1. Electric 2020 — OK
 *   2. Diesel 2018 — UPCOMING (service due in ~7 days)
 *   3. LPG 2016 — DUE soon by hours
 *   4. Gasoline 2015 — OVERDUE by ~12 days
 *   5. Electric 2022 — Under repair
 */
async function main() {
  console.log("🌱 Seeding database...");

  // Clear existing data
  await prisma.notification.deleteMany();
  await prisma.serviceRecord.deleteMany();
  await prisma.serviceSettings.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.forklift.deleteMany();
  await prisma.appSettings.deleteMany();

  await prisma.appSettings.create({
    data: {
      id: "global",
      defaultReminderDaysBefore: 14,
      defaultSecondReminderDays: 3,
      defaultRepeatOverdueDays: 3,
      dailyCheckTime: "08:00",
      remindersEnabled: true,
      enableInApp: true,
      enableEmail: false,
      enablePush: false,
    },
  });

  const today = new Date();

  // 1) Electric 2020 — OK
  const f1 = await prisma.forklift.create({
    data: {
      internalNumber: "F-001",
      description: "מלגזה חשמלית — מחסן ראשי",
      manufacturer: "Toyota",
      model: "8FBE20",
      serialNumber: "TY-8FBE20-001",
      year: 2020,
      fuelType: "ELECTRIC",
      location: "מחסן ראשי",
      department: "לוגיסטיקה",
      responsiblePerson: "יוסי כהן",
      status: "ACTIVE",
      currentHours: 1200,
      notes: "מצב כללי טוב, מצבר חדש מ-2024.",
    },
  });
  await prisma.serviceSettings.create({
    data: {
      forkliftId: f1.id,
      trackingMode: "BOTH",
      dateIntervalMonths: 6,
      hoursInterval: 500,
      lastServiceDate: subMonths(today, 2),
      lastServiceHours: 1000,
      nextServiceDate: addMonths(today, 4),
      nextServiceHours: 1500,
      reminderDaysBefore: 14,
      secondReminderDaysBefore: 3,
      repeatOverdueReminderDays: 3,
      hoursReminderThreshold: 50,
      remindersEnabled: true,
    },
  });
  await prisma.serviceRecord.create({
    data: {
      forkliftId: f1.id,
      serviceDate: subMonths(today, 2),
      serviceHours: 1000,
      serviceType: "טיפול תקופתי",
      workDescription: "בדיקה כללית, שמן הידראולי, מתח מצבר.",
      supplier: "מוסך מורן",
      cost: 850,
      invoiceNumber: "INV-3344",
    },
  });

  // 2) Diesel 2018 — UPCOMING (next service in 7 days)
  const f2 = await prisma.forklift.create({
    data: {
      internalNumber: "F-002",
      description: "מלגזת דיזל — חצר",
      manufacturer: "Hyster",
      model: "H3.5FT",
      serialNumber: "HY-H35-002",
      year: 2018,
      fuelType: "DIESEL",
      location: "חצר אחורית",
      department: "הובלות",
      responsiblePerson: "אבי לוי",
      status: "ACTIVE",
      currentHours: 5400,
      notes: "מצב טוב, פילטר אוויר הוחלף ב-2024.",
    },
  });
  await prisma.serviceSettings.create({
    data: {
      forkliftId: f2.id,
      trackingMode: "BOTH",
      dateIntervalMonths: 3,
      hoursInterval: 250,
      lastServiceDate: subMonths(today, 3),
      lastServiceHours: 5200,
      nextServiceDate: addDays(today, 7),
      nextServiceHours: 5450,
      reminderDaysBefore: 14,
      secondReminderDaysBefore: 3,
      repeatOverdueReminderDays: 3,
      hoursReminderThreshold: 50,
      remindersEnabled: true,
    },
  });

  // 3) LPG 2016 — hours-based, close to threshold
  const f3 = await prisma.forklift.create({
    data: {
      internalNumber: "F-003",
      description: "מלגזת גז — ייצור",
      manufacturer: "Yale",
      model: "GLP25",
      serialNumber: "YA-GLP25-003",
      year: 2016,
      fuelType: "LPG",
      location: "אולם ייצור",
      department: "ייצור",
      responsiblePerson: "מירי גרינברג",
      status: "ACTIVE",
      currentHours: 8970,
      notes: "ותיקה אך אמינה.",
    },
  });
  await prisma.serviceSettings.create({
    data: {
      forkliftId: f3.id,
      trackingMode: "HOURS",
      hoursInterval: 250,
      lastServiceHours: 8750,
      nextServiceHours: 9000, // 30 hours away → UPCOMING
      reminderDaysBefore: 14,
      hoursReminderThreshold: 50,
      remindersEnabled: true,
    },
  });

  // 4) Gasoline 2015 — OVERDUE by 12 days
  const f4 = await prisma.forklift.create({
    data: {
      internalNumber: "F-004",
      description: "מלגזת בנזין — חירום",
      manufacturer: "Komatsu",
      model: "FG25",
      serialNumber: "KO-FG25-004",
      year: 2015,
      fuelType: "GASOLINE",
      location: "מבנה 4",
      department: "אחזקה",
      responsiblePerson: "דני שוורץ",
      status: "ACTIVE",
      currentHours: 12300,
      notes: "דורש החלפת בלמים בקרוב.",
    },
  });
  await prisma.serviceSettings.create({
    data: {
      forkliftId: f4.id,
      trackingMode: "BOTH",
      dateIntervalMonths: 3,
      hoursInterval: 250,
      lastServiceDate: subMonths(today, 3),
      lastServiceHours: 12000,
      nextServiceDate: subDays(today, 12), // OVERDUE
      nextServiceHours: 12250, // already passed
      reminderDaysBefore: 14,
      secondReminderDaysBefore: 3,
      repeatOverdueReminderDays: 3,
      hoursReminderThreshold: 50,
      remindersEnabled: true,
    },
  });
  await prisma.serviceRecord.create({
    data: {
      forkliftId: f4.id,
      serviceDate: subMonths(today, 3),
      serviceHours: 12000,
      serviceType: "טיפול תקופתי",
      workDescription: "החלפת שמן ופילטרים.",
      partsReplaced: "פילטר שמן, פילטר אוויר",
      supplier: "מוסך מורן",
      cost: 1100,
      invoiceNumber: "INV-3120",
    },
  });

  // 5) Electric 2022 — Under repair
  const f5 = await prisma.forklift.create({
    data: {
      internalNumber: "F-005",
      description: "מלגזה חשמלית קטנה",
      manufacturer: "Crown",
      model: "ESR5000",
      serialNumber: "CR-ESR-005",
      year: 2022,
      fuelType: "ELECTRIC",
      location: "מחסן צד",
      department: "לוגיסטיקה",
      responsiblePerson: "יוסי כהן",
      status: "UNDER_REPAIR",
      currentHours: 600,
      notes: "במוסך — תקלה במערכת ההגה.",
    },
  });
  await prisma.serviceSettings.create({
    data: {
      forkliftId: f5.id,
      trackingMode: "BOTH",
      dateIntervalMonths: 6,
      hoursInterval: 500,
      lastServiceDate: subMonths(today, 1),
      lastServiceHours: 500,
      nextServiceDate: addMonths(today, 5),
      nextServiceHours: 1000,
      reminderDaysBefore: 14,
      remindersEnabled: true,
    },
  });

  console.log("✅ Seed complete. 5 forklifts created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
