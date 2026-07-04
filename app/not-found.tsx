import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight">Страница не найдена</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Возможно, она была удалена или адрес введён неверно.
      </p>
      <Button className="mt-2" nativeButton={false} render={<Link href="/">На главную</Link>} />
    </div>
  );
}
