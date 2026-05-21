import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ServiceRecordForm from "@/components/ServiceRecordForm";
import { createServiceRecord } from "@/app/actions/services";

export default async function NewServiceRecordPage({
  params,
}: {
  params: { id: string };
}) {
  const f = await prisma.forklift.findUnique({
    where: { id: params.id },
  });
  if (!f) notFound();

  const action = createServiceRecord.bind(null, f.id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">
        רישום טיפול — מלגזה {f.internalNumber}
      </h1>
      <p className="text-sm text-slate-500">
        רישום הטיפול יעדכן אוטומטית את תאריך/שעות הטיפול הבא לפי מרווחי
        ההגדרות.
      </p>
      <ServiceRecordForm action={action} defaultHours={f.currentHours} />
    </div>
  );
}
