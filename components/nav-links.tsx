"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Мои цели" },
  { href: "/today", label: "Сегодня" },
  { href: "/reflections", label: "Неделя" },
  { href: "/review", label: "Обзор" },
  { href: "/gallery", label: "Галерея" },
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
