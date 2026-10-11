"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { downloadFile } from "@/lib/download";

const DownloadAuthContext = createContext<(() => Promise<string | null>) | null>(null);

export function DownloadAuthProvider({ getToken, children }: { getToken: () => Promise<string | null>; children: ReactNode }) {
  return <DownloadAuthContext.Provider value={getToken}>{children}</DownloadAuthContext.Provider>;
}

export function DownloadButton({ url, name, className, label = "Download" }: { url: string; name: string; className: string; label?: string }) {
  const getToken = useContext(DownloadAuthContext);
  const [failed, setFailed] = useState(false);

  async function save() {
    setFailed(false);
    try {
      const token = getToken ? await getToken() : null;
      await downloadFile({
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
        token,
        url,
        name,
      });
    } catch {
      setFailed(true);
    }
  }

  return (
    <button type="button" aria-label={failed ? "The file could not be downloaded" : label} className={className} onClick={() => void save()}>
      ↓
    </button>
  );
}
