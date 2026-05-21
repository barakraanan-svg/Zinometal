import { SERVICE_STATUS, type ServiceStatusKey } from "@/lib/constants";

const COLOR_CLASS: Record<string, string> = {
  green: "bg-green-100 text-green-800 ring-green-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  orange: "bg-orange-100 text-orange-900 ring-orange-200",
  red: "bg-red-100 text-red-800 ring-red-200",
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-100 text-blue-800 ring-blue-200",
};

export default function StatusBadge({
  status,
  label,
}: {
  status: ServiceStatusKey;
  label?: string;
}) {
  const def = SERVICE_STATUS[status];
  const cls = COLOR_CLASS[def.color] ?? COLOR_CLASS.gray;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cls}`}
    >
      {label ?? def.label}
    </span>
  );
}
