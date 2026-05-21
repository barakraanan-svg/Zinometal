import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "מעקב טיפולי מלגזות",
  description: "ניהול טיפולים שוטפים, יומני שירות והתראות למלגזות במפעל",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const unreadCount = await prisma.notification
    .count({ where: { isRead: false } })
    .catch(() => 0);

  return (
    <html lang="he" dir="rtl">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen antialiased">
        <Navbar unreadCount={unreadCount} />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
