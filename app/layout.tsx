import type { Metadata } from "next";
import { cookies } from "next/headers";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Цели",
  description: "Персональное приложение для постановки, финансирования и достижения целей",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // SSR theme without flash (T10): the `theme` cookie mirrors users.theme
  // (set by lib/actions/profile.ts) and is read here so the very first
  // response already has the right <html class="dark"> — the DB row stays
  // the source of truth, this cookie only drives rendering.
  const cookieStore = await cookies();
  const theme = cookieStore.get("theme")?.value;

  return (
    <html
      lang="ru"
      className={`${fontVariables} h-full antialiased${theme === "dark" ? " dark" : ""}`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
