"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { trackGlobalGalleryOpened } from "@/app/(app)/gallery/actions";
import { Badge } from "@/components/ui/badge";
import { Lightbox, type LightboxItem } from "@/components/gallery/lightbox";

export interface GalleryTile {
  id: string;
  url: string;
  caption: string | null;
  goalTitle: string | null;
}

export interface GalleryGoalOption {
  id: string;
  title: string;
}

/**
 * Global gallery (PRD §3.4) — CSS-columns masonry across all goals, a
 * goal filter select (drives the `?goalId=` URL param; the page re-fetches
 * and re-filters server-side on navigation, per T9's "no client-side data
 * fetching" decision), and the T8 Lightbox reused as-is.
 */
export function MasonryGrid({
  items,
  goals,
  selectedGoalId,
}: {
  items: GalleryTile[];
  goals: GalleryGoalOption[];
  selectedGoalId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const hasTrackedOpen = useRef(false);

  const lightboxItems: LightboxItem[] = items.map((item) => ({
    url: item.url,
    caption: item.caption ?? undefined,
  }));

  function openLightbox(index: number) {
    setOpenIndex(index);
    // gallery_opened fires once per page visit, on the first lightbox open
    // (T9 decision) — not on every subsequent open/navigation.
    if (!hasTrackedOpen.current) {
      hasTrackedOpen.current = true;
      void trackGlobalGalleryOpened();
    }
  }

  function handleFilterChange(goalId: string) {
    const params = new URLSearchParams();
    if (goalId) params.set("goalId", goalId);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-5">
      <select
        aria-label="Фильтр по цели"
        value={selectedGoalId ?? ""}
        onChange={(e) => handleFilterChange(e.target.value)}
        className="h-8 w-fit rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        <option value="">Все цели</option>
        {goals.map((goal) => (
          <option key={goal.id} value={goal.id}>
            {goal.title}
          </option>
        ))}
      </select>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет изображений для выбранной цели.</p>
      ) : (
        <div className="columns-1 gap-4 md:columns-2 lg:columns-4">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openLightbox(index)}
              className="mb-4 block w-full break-inside-avoid overflow-hidden rounded-[18px] bg-muted text-left ring-1 ring-foreground/8 transition-transform hover:-translate-y-0.5"
            >
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static/optimizable asset (mirrors components/gallery/lightbox.tsx) */}
                <img src={item.url} alt="" className="block w-full" />
                {item.goalTitle ? (
                  <Badge
                    variant="secondary"
                    className="absolute top-2 left-2 bg-background/85 backdrop-blur-sm"
                  >
                    {item.goalTitle}
                  </Badge>
                ) : null}
              </div>
              {item.caption ? (
                <p className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.caption}</p>
              ) : null}
            </button>
          ))}
        </div>
      )}

      <Lightbox items={lightboxItems} openIndex={openIndex} onClose={() => setOpenIndex(null)} />
    </div>
  );
}
