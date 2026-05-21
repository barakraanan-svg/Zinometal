import Link from "next/link";

export default function Navbar({ unreadCount }: { unreadCount: number }) {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="text-lg font-bold text-slate-800 hover:text-brand-600"
        >
          🚜 מעקב טיפולי מלגזות
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/"
            className="text-slate-600 hover:text-brand-600 hover:underline"
          >
            דשבורד
          </Link>
          <Link
            href="/forklifts"
            className="text-slate-600 hover:text-brand-600 hover:underline"
          >
            מלגזות
          </Link>
          <Link
            href="/notifications"
            className="relative text-slate-600 hover:text-brand-600 hover:underline"
          >
            התראות
            {unreadCount > 0 && (
              <span className="absolute -top-2 -left-3 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                {unreadCount}
              </span>
            )}
          </Link>
          <Link
            href="/settings"
            className="text-slate-600 hover:text-brand-600 hover:underline"
          >
            הגדרות
          </Link>
        </nav>
      </div>
    </header>
  );
}
