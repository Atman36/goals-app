import { EmptyState } from "@/components/goals/empty-state";

// P2 per PRD §3.6 — kept as a route stub so the nav/IA is stable early.
export default function ReflectionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">Рефлексия</h1>
      <EmptyState
        title="Раздел в разработке"
        description="Еженедельная рефлексия появится в фазе 3 методологии."
      />
    </div>
  );
}
