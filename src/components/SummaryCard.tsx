export default function SummaryCard({
  title,
  value,
  tone = "default",
  hint,
}: {
  title: string;
  value: number | string;
  tone?: "default" | "good" | "warn" | "bad" | "info";
  hint?: string;
}) {
  const toneClass = {
    default: "bg-white border-slate-200 text-slate-900",
    good: "bg-green-50 border-green-200 text-green-900",
    warn: "bg-amber-50 border-amber-200 text-amber-900",
    bad: "bg-red-50 border-red-200 text-red-900",
    info: "bg-blue-50 border-blue-200 text-blue-900",
  }[tone];

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <div className="text-sm font-medium opacity-80">{title}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs opacity-70">{hint}</div>}
    </div>
  );
}
