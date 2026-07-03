import { EmptyState } from "@/components/goals/empty-state";

// TODO(build): masonry grid of all MediaItems across goals + lightbox — PRD §3.4.
export default function GalleryPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Галерея</h1>
      <EmptyState
        title="Пока нет изображений"
        description="Изображения появятся здесь по мере добавления целей и обновления галерей."
      />
    </div>
  );
}
