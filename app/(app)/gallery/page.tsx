import { getCurrentUser } from "@/lib/auth";
import { listAllMedia } from "@/lib/db/queries/media";
import { listGoals } from "@/lib/db/queries/goals";
import { getSignedMediaUrl } from "@/lib/storage";
import { EmptyState } from "@/components/goals/empty-state";
import { MasonryGrid, type GalleryTile } from "@/components/gallery/masonry-grid";

// PRD §3.4: a vision-board page — every image from every goal in one masonry
// grid with goal tags, a goal filter, and the shared lightbox (T8). Server
// component: signed URLs are resolved up front, and the `?goalId=` filter is
// applied here (not client-side) — the T9 decision is "no new query", so it
// filters lib/db/queries/media.ts's listAllMedia result in place.
export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ goalId?: string }>;
}) {
  const user = await getCurrentUser();

  const sp = await searchParams;

  const [media, goals] = await Promise.all([listAllMedia(user.id), listGoals(user.id, {})]);

  const withUrls = await Promise.all(
    media.map(async (m) => ({ ...m, url: await getSignedMediaUrl(m.storagePath).catch(() => null) })),
  );
  const resolved = withUrls.filter((m): m is typeof m & { url: string } => !!m.url);

  // Only media directly attached to a goal carries that goal's id on the row
  // itself (comment-attached photos resolve their goal via the comment, which
  // listAllMedia already folds into `goalTitle` but not into a goal id) — so
  // the filter matches on the direct FK. Comment photos still show up under
  // "Все цели", just aren't selectable by a specific goal from this page.
  const filtered = sp.goalId ? resolved.filter((m) => m.goalId === sp.goalId) : resolved;

  const tiles: GalleryTile[] = filtered.map((m) => ({
    id: m.id,
    url: m.url,
    caption: m.caption,
    goalTitle: m.goalTitle,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[36px] leading-tight font-bold tracking-tight">Галерея</h1>

      {resolved.length === 0 ? (
        <EmptyState
          title="Пока нет изображений"
          description="Добавьте фото к целям — они соберутся здесь в карту визуализации."
          actionHref="/goals/new"
          actionLabel="+ Новая цель"
        />
      ) : (
        <MasonryGrid
          items={tiles}
          goals={goals.map((g) => ({ id: g.id, title: g.title }))}
          selectedGoalId={sp.goalId}
        />
      )}
    </div>
  );
}
