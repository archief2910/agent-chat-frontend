"use client";

import { useAuth } from "@clerk/nextjs";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { UsageView, type UsagePeriod } from "@/components/usage-view";
import { ApiError, createApi } from "@/lib/api";

export function UsageScreen() {
  const { getToken } = useAuth();
  const api = useMemo(
    () => createApi({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001", getToken }),
    [getToken],
  );
  const [period, setPeriod] = useState<UsagePeriod>("current");
  const usage = useQuery({ queryKey: ["usage", period], queryFn: () => api.usage(period), placeholderData: keepPreviousData });

  return (
    <div className="flex h-screen bg-white text-[#1b1b1b]">
      <AppSidebar active="usage" />
      {usage.data ? <UsageView summary={usage.data} period={period} onPeriod={setPeriod} /> : null}
      {usage.isLoading ? <p className="p-8 text-[14px] text-[#6b7280]">Loading usage…</p> : null}
      {usage.error ? (
        <p role="alert" className="p-8 text-[14px] text-amber-800">
          {usage.error instanceof ApiError ? usage.error.message : "Usage could not be loaded."}
        </p>
      ) : null}
    </div>
  );
}
