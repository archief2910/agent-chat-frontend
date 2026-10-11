"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { LibraryView } from "@/components/library-view";
import { ApiError, createApi } from "@/lib/api";
import type { LibraryAsset } from "@/lib/library";
import { uploadFiles } from "@/lib/uppy-upload";

const FAVORITES_KEY = "library-favorites";

export function LibraryScreen() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const api = useMemo(
    () => createApi({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001", getToken }),
    [getToken],
  );
  const library = useQuery({
    queryKey: ["assets", "library"],
    queryFn: () => loadLibrary(api),
  });
  const [favorites, setFavorites] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) setFavorites(parsed);
    } catch {
      setFavorites([]);
    }
  }, []);

  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function upload(files: File[]) {
    setUploadError(null);
    try {
      await uploadFiles(api, files);
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    } catch (error) {
      setUploadError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : "The upload failed.");
    }
  }

  return (
    <div className="flex h-screen bg-white text-[#1b1b1b]">
      <AppSidebar active="library" />
      {library.data ? (
        <LibraryView assets={library.data} favorites={favorites} now={new Date()} onToggleFavorite={toggleFavorite} onUpload={(files) => void upload(files)} />
      ) : null}
      {library.isLoading ? <p className="p-8 text-[14px] text-[#6b7280]">Loading library…</p> : null}
      {library.error ? <p role="alert" className="p-8 text-[14px] text-amber-800">{library.error instanceof ApiError ? library.error.message : "The library could not be loaded."}</p> : null}
      {uploadError ? <p role="alert" className="p-8 text-[14px] text-amber-800">{uploadError}</p> : null}
    </div>
  );
}

async function loadLibrary(api: ReturnType<typeof createApi>): Promise<LibraryAsset[]> {
  const assets: LibraryAsset[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.listAssets(cursor);
    assets.push(...page.assets);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return assets;
}
