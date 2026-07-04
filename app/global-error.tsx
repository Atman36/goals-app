"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
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
    // global-error must include its own html and body tags — it replaces the
    // root layout when active, so global CSS/fonts are not guaranteed to load.
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#17130F",
          color: "#F7F1E8",
        }}
      >
        <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>Что-то пошло не так</h1>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: "8px",
            padding: "8px 16px",
            borderRadius: "10px",
            border: "none",
            background: "#EE6C4D",
            color: "#17130F",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Перезагрузить
        </button>
      </body>
    </html>
  );
}
