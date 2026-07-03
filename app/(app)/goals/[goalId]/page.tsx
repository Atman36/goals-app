import { notFound } from "next/navigation";

// TODO(build): load the goal by id + userId (RLS-scoped), render header,
// quick-add, checklist, history, comments, gallery, WOOP — PRD §3.3.
export default async function GoalPage({
  params,
}: {
  params: Promise<{ goalId: string }>;
}) {
  const { goalId } = await params;
  if (!goalId) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Цель {goalId}</h1>
      <p className="text-sm text-muted-foreground">Страница цели ещё не подключена к базе данных.</p>
    </div>
  );
}
