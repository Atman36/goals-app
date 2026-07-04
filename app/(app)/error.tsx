"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight">Что-то пошло не так</h1>
      {error.digest ? <p className="text-xs text-muted-foreground">Код ошибки: {error.digest}</p> : null}
      <Button className="mt-2" onClick={() => reset()}>
        Попробовать ещё раз
      </Button>
    </div>
  );
}
