// TODO(build): edit form reusing the goal wizard fields — PRD §3.2.
export default async function EditGoalPage({
  params,
}: {
  params: Promise<{ goalId: string }>;
}) {
  const { goalId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Редактирование цели {goalId}</h1>
    </div>
  );
}
