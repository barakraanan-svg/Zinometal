import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ForkliftForm from "@/components/ForkliftForm";
import { updateForklift, archiveForklift } from "@/app/actions/forklifts";

export default async function EditForkliftPage({
  params,
}: {
  params: { id: string };
}) {
  const f = await prisma.forklift.findUnique({
    where: { id: params.id },
    include: { serviceSettings: true },
  });
  if (!f) notFound();

  const update = updateForklift.bind(null, f.id);
  const archive = archiveForklift.bind(null, f.id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">
        עריכת מלגזה {f.internalNumber}
      </h1>

      <ForkliftForm
        action={update}
        initial={f}
        submitLabel="שמור שינויים"
        showServiceSettings={false}
      />

      <form
        action={archive}
        className="rounded-lg border border-amber-200 bg-amber-50 p-4"
      >
        <div className="text-sm font-medium text-amber-900">העברת לארכיון</div>
        <p className="mt-1 text-xs text-amber-800">
          העברת המלגזה לסטטוס &quot;לא פעילה&quot; תשמור את כל ההיסטוריה אך תוציא אותה
          ממעקב הטיפולים. עדיף לארכב מאשר למחוק.
        </p>
        <button
          type="submit"
          className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          onClick={undefined}
        >
          העבר לארכיון
        </button>
      </form>
    </div>
  );
}
