import Link from "next/link";

import { Button } from "@/components/ui/button";
import { NavLinks } from "@/components/nav-links";
import { QueryProvider } from "@/components/providers/query-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <div className="flex min-h-full flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b bg-background/86 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="font-display text-lg font-bold tracking-tight">
              Цели
            </Link>
            <NavLinks />
            <div className="flex items-center gap-3">
              <Button nativeButton={false} render={<Link href="/goals/new">+ Новая цель</Link>} />
              <div
                aria-hidden
                className="size-[38px] shrink-0 rounded-full [background-image:var(--gradient-tile)]"
              />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 animate-fade-in px-4 py-6 sm:px-6">{children}</main>
      </div>
    </QueryProvider>
  );
}
