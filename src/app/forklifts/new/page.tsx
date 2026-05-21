import ForkliftForm from "@/components/ForkliftForm";
import { createForklift } from "@/app/actions/forklifts";

export default function NewForkliftPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">הוספת מלגזה</h1>
      <ForkliftForm action={createForklift} submitLabel="צור מלגזה" />
    </div>
  );
}
