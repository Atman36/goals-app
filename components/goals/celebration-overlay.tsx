"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// PRD §9 Phase 2 · concept "isCeleb" screen — the celebration shown once a goal
// is marked achieved (reached via ?celebrate=1). Faithful to the concept card:
// a floating cover, "🎉 ЦЕЛЬ ДОСТИГНУТА", the title, a stat line, and the
// dashboard / gallery CTAs. Dismissing drops the query param.
export function CelebrationOverlay({
  goalId,
  title,
  coverUrl,
  statLine,
}: {
  goalId: string;
  title: string;
  coverUrl: string | null;
  statLine: string;
}) {
  const router = useRouter();

  function close() {
    router.replace(`/goals/${goalId}`, { scroll: false });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // close is stable for the overlay's lifetime (goalId doesn't change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Цель достигнута"
      onClick={close}
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-6 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-pop-in relative w-full max-w-[560px] rounded-[26px] bg-card p-10 text-center shadow-[0_30px_70px_-34px_rgba(33,28,23,0.5)] ring-1 ring-foreground/9"
      >
        <button
          type="button"
          aria-label="Закрыть"
          onClick={close}
          className="absolute top-4 right-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-5" />
        </button>

        <div
          className="animate-floaty relative mx-auto size-[120px] overflow-hidden rounded-[32px]"
          style={{ background: "var(--gradient-tile)" }}
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
            <img src={coverUrl} alt="" className="size-full object-cover" />
          ) : null}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "repeating-linear-gradient(45deg,rgba(255,255,255,0.12) 0 2px,transparent 2px 12px)",
            }}
          />
        </div>

        <p className="mt-7 text-[15px] font-bold tracking-wide text-primary">🎉 ЦЕЛЬ ДОСТИГНУТА</p>
        <h2 className="mt-1.5 font-display text-[34px] leading-[1.05] font-bold tracking-tight">
          {title}
        </h2>
        <p className="mt-3.5 text-[15px] text-muted-foreground">{statLine}</p>

        <div className="mt-8 flex justify-center gap-3">
          <Button
            size="lg"
            className="flex-1"
            nativeButton={false}
            render={<Link href="/">На дашборд</Link>}
          />
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href="/gallery">В галерею</Link>}
          />
        </div>
      </div>
    </div>
  );
}
