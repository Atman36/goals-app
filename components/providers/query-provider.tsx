"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Provides a single QueryClient instance to descendants (optimistic quick-add,
// PRD §3.3.1). Not mounted anywhere yet — a later task wires this into the tree.
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
