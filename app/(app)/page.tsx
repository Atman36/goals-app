import { EmptyState } from "@/components/goals/empty-state";

// TODO(build): replace with a real query — SELECT goals for the current user
// (see docs/BUILD_PROMPT.md → Фаза 1 → Дашборд).
export default function DashboardPage() {
  const goals: unknown[] = [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Мои цели</h1>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          title="Пока нет ни одной цели"
          description="Создайте первую цель — с картинкой, суммой (или чек-листом) и сроком, — чтобы начать путь к результату."
          actionHref="/goals/new"
          actionLabel="+ Новая цель"
        />
      ) : null}
    </div>
  );
}
