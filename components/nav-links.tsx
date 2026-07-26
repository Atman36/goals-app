"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// «Сегодня» stays in the nav even though it now points at the logo's own href:
// it is the only thing that highlights the active section, which the logo does
// not do. The goal list moved to /goals.
const NAV_ITEMS = [
  { href: "/", label: "Сегодня" },
  { href: "/goals", label: "Цели" },
  { href: "/reflections", label: "Неделя" },
  { href: "/review", label: "Обзор" },
  { href: "/gallery", label: "Галерея" },
  { href: "/metrics", label: "Приборы" },
  { href: "/settings", label: "Настройки" },
];

export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "flex items-center gap-3 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4 md:justify-center",
        className
      )}
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 whitespace-nowrap transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
