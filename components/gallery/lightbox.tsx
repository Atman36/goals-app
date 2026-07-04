"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface LightboxItem {
  url: string;
  caption?: string;
}

/**
 * Generic image lightbox — kept dependency-free and content-agnostic
 * (T8 decision) so it can be reused by the global gallery page later.
 * Backdrop click closes; ← → keys navigate between items.
 */
export function Lightbox({
  items,
  openIndex,
  onClose,
}: {
  items: LightboxItem[];
  openIndex: number | null;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(openIndex ?? 0);
  // React's "adjust state during render" pattern (not an effect): reset the
  // displayed index when the caller re-opens the lightbox at a different
  // starting index, without an extra post-commit render.
  const [prevOpenIndex, setPrevOpenIndex] = useState(openIndex);
  if (openIndex !== prevOpenIndex) {
    setPrevOpenIndex(openIndex);
    if (openIndex !== null) setIndex(openIndex);
  }

  useEffect(() => {
    if (openIndex === null || items.length === 0) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + items.length) % items.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % items.length);
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [openIndex, onClose, items.length]);

  if (openIndex === null) return null;
  const item = items[index];
  if (!item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фото"
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      {items.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Предыдущее изображение"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i - 1 + items.length) % items.length);
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            aria-label="Следующее изображение"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i + 1) % items.length);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      ) : null}

      <figure
        role="presentation"
        className="flex max-h-full max-w-3xl flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static/optimizable asset */}
        <img
          src={item.url}
          alt={item.caption ?? ""}
          className="max-h-[80vh] max-w-full rounded-2xl object-contain"
        />
        {item.caption ? <figcaption className="text-sm text-white/80">{item.caption}</figcaption> : null}
      </figure>
    </div>
  );
}
