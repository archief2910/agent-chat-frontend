"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { DownloadAuthProvider } from "@/components/download-button";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <ClerkProvider>
      <QueryClientProvider client={client}>
        <SignedDownloads>{children}</SignedDownloads>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function SignedDownloads({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  return <DownloadAuthProvider getToken={getToken}>{children}</DownloadAuthProvider>;
}
