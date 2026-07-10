import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails } from "@/lib/db/queries/goals";
import { listContributions } from "@/lib/db/queries/contributions";
import { listChecklistItems } from "@/lib/db/queries/checklist";
import { listComments } from "@/lib/db/queries/comments";
import { listMediaByGoal } from "@/lib/db/queries/media";
import { getWoopByGoal } from "@/lib/db/queries/woop";
import { getGoalStreak } from "@/lib/db/queries/streaks";
import { getSignedMediaUrl } from "@/lib/storage";
import { formatMoney } from "@/lib/utils/money";
import { pluralRu } from "@/lib/utils/plural";
import type { Currency } from "@/lib/validators/goal";
import { Button } from "@/components/ui/button";
import { FinancialProgressHeader, MarkAchievedButton, QuickAddSheet } from "@/components/goals/quick-add-sheet";
import { CelebrationOverlay } from "@/components/goals/celebration-overlay";
import { ContributionHistory } from "@/components/goals/contribution-history";
import { ChecklistBlock, ChecklistProgressHeader } from "@/components/goals/checklist-block";
import { CommentsBlock, type CommentWithPhotoUrl } from "@/components/goals/comments-block";
import { GoalGallery, type GalleryImage } from "@/components/goals/goal-gallery";
import { WoopBlock } from "@/components/goals/woop-block";
import { FocusToggle } from "@/components/goals/focus-toggle";
import { StreakBadge } from "@/components/goals/streak-badge";

// PRD §3.3: a goal's page — progress ring, idempotent quick-add, checklist,
// history, comments, gallery. Server component fetching everything up front;
// interactive islands (quick-add, checklist, comments, gallery) are client
// components hydrated with this initial data (T8).
export default async function GoalPage({
  params,
  searchParams,
}: {
  params: Promise<{ goalId: string }>;
  searchParams: Promise<{ add?: string; celebrate?: string }>;
}) {
  const { goalId } = await params;
  const sp = await searchParams;

  const user = await getCurrentUser();

  const goal = await getGoalWithDetails(user.id, goalId);
  if (!goal) notFound();

  const isFinancial = goal.kind === "financial";

  const contributions = isFinancial ? await listContributions(user.id, goalId) : [];
  const [checklistItems, comments, media, woop, streak] = await Promise.all([
    listChecklistItems(user.id, goalId),
    listComments(user.id, goalId),
    listMediaByGoal(user.id, goalId),
    getWoopByGoal(user.id, goalId),
    getGoalStreak(user.id, goalId),
  ]);

  const mediaWithUrls = await Promise.all(
    media.map(async (m) => ({ ...m, url: await getSignedMediaUrl(m.storagePath).catch(() => null) })),
  );

  const orderedGallery = mediaWithUrls.filter((m): m is typeof m & { url: string } => !!m.url);
  if (goal.coverImageId) {
    const coverIndex = orderedGallery.findIndex((m) => m.id === goal.coverImageId);
    if (coverIndex > 0) {
      const [cover] = orderedGallery.splice(coverIndex, 1);
      orderedGallery.unshift(cover);
    }
  }
  const galleryImages: GalleryImage[] = orderedGallery.map((m) => ({
    id: m.id,
    url: m.url,
    caption: m.caption,
  }));

  const commentsWithPhotos: CommentWithPhotoUrl[] = comments.map((c) => {
    const photo = mediaWithUrls.find((m) => m.commentId === c.id);
    return { ...c, photoUrl: photo?.url ?? null };
  });

  const deadlineLabel = format(parseISO(goal.deadline), "d MMMM yyyy", { locale: ru });
  const isFocus = user.focusGoalId === goal.id;

  // Celebration screen (?celebrate=1 after marking achieved) — PRD §9 Phase 2.
  const showCelebration = sp.celebrate === "1" && goal.status === "achieved";
  const savedTotal = (goal.initialAmount ?? 0n) + contributions.reduce((s, c) => s + c.amount, 0n);
  const doneItems = checklistItems.filter((i) => i.isDone).length;
  const celebrationStatLine = isFinancial
    ? `Накоплено ${formatMoney(savedTotal, goal.currency as Currency)} · ${contributions.length} ${pluralRu(contributions.length, "пополнение", "пополнения", "пополнений")}`
    : `${doneItems} ${pluralRu(doneItems, "шаг", "шага", "шагов")} пройдено`;

  return (
    <div className="flex flex-col gap-8">
      <Link href="/" className="self-start text-sm text-muted-foreground hover:text-foreground">
        ← Мои цели
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            {isFinancial ? "Финансовая цель" : "Нефинансовая цель"} · до {deadlineLabel}
          </span>
          <h1 className="font-display text-[36px] leading-tight font-bold tracking-tight">{goal.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {goal.status === "active" ? <FocusToggle goalId={goal.id} isFocus={isFocus} /> : null}
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/goals/${goal.id}/edit`}>Редактировать</Link>}
          />
          {goal.status !== "achieved" ? <MarkAchievedButton goalId={goal.id} /> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr]">
        <GoalGallery goalId={goal.id} images={galleryImages} coverMediaId={goal.coverImageId} />

        <div className="flex flex-col gap-4">
          {isFinancial ? (
            <FinancialProgressHeader
              goalId={goal.id}
              currency={goal.currency as Currency}
              initialAmount={goal.initialAmount ?? 0n}
              targetAmount={goal.targetAmount ?? 0n}
              deadline={goal.deadline}
              initialContributions={contributions}
            />
          ) : (
            <ChecklistProgressHeader
              goalId={goal.id}
              goalKind={goal.kind}
              deadline={goal.deadline}
              initialItems={checklistItems}
            />
          )}

          <p className="text-sm text-muted-foreground">
            до {deadlineLabel}
            {goal.status === "achieved" ? " · Достигнута 🎉" : ""}
          </p>

          <StreakBadge weeks={streak} className="self-start" />

          {isFinancial ? (
            <QuickAddSheet
              goalId={goal.id}
              currency={goal.currency as Currency}
              initialAmount={goal.initialAmount ?? 0n}
              targetAmount={goal.targetAmount ?? 0n}
              initialContributions={contributions}
              autoOpen={sp.add === "1"}
            />
          ) : null}
        </div>
      </div>

      {isFinancial ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <ContributionHistory
            goalId={goal.id}
            currency={goal.currency as Currency}
            initialContributions={contributions}
          />
          <ChecklistBlock goalId={goal.id} goalKind={goal.kind} initialItems={checklistItems} />
        </div>
      ) : (
        <ChecklistBlock goalId={goal.id} goalKind={goal.kind} initialItems={checklistItems} />
      )}

      <WoopBlock goalId={goal.id} initialWoop={woop} />

      <CommentsBlock goalId={goal.id} comments={commentsWithPhotos} />

      {showCelebration ? (
        <CelebrationOverlay
          goalId={goal.id}
          title={goal.title}
          coverUrl={galleryImages[0]?.url ?? null}
          statLine={celebrationStatLine}
        />
      ) : null}
    </div>
  );
}
