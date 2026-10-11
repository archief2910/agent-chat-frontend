"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import { usageSummarySchema } from "@/generated/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatUsageAmount, formatUsageRange, formatUsageTimestamp } from "@/lib/usage-format";

export type UsageSummary = z.infer<typeof usageSummarySchema>;
export type UsagePeriod = UsageSummary["period"]["id"];

type SortKey = "name" | "debited" | "executions" | "latest";

export function UsageView({
  summary,
  period,
  onPeriod,
}: {
  summary: UsageSummary;
  period: UsagePeriod;
  onPeriod: (period: UsagePeriod) => void;
}) {
  const [tab, setTab] = useState<"overview" | "detailed">("overview");
  const [categoryId, setCategoryId] = useState(summary.categories[0]?.id ?? "");
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "latest", direction: "desc" });

  useEffect(() => {
    if (summary.categories.some((category) => category.id === categoryId)) return;
    setCategoryId(summary.categories[0]?.id ?? "");
  }, [categoryId, summary.categories]);

  const selected = summary.categories.find((category) => category.id === categoryId) ?? summary.categories[0] ?? null;
  const execution = selected?.rows.find((row) => row.id === executionId) ?? null;
  const categories = useMemo(() => sortCategories(summary.categories, sort), [summary.categories, sort]);
  const range = formatUsageRange(summary.period.from, summary.period.to, summary.period.id);

  function chooseCategory(id: string) {
    setCategoryId(id);
    setTab("detailed");
  }

  function toggleSort(key: SortKey) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  }

  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 min-[721px]:px-8 min-[721px]:py-8">
      <div className="mx-auto w-full max-w-[1080px]">
        <h1 className="text-[28px] font-semibold leading-tight text-[#1b1b1b]">AI Credits Overview</h1>
        <p className="mt-1 text-[14px] text-[#6b7280]">Track your AI usage and optimize credit spend</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={<CoinIcon />} label="Total debited" value={formatUsageAmount(summary.totals.debitedMicrocredits)} suffix="credits" />
          <Stat icon={<DocIcon />} label="Executions" value={String(summary.totals.executions)} />
          <Stat icon={<ListIcon />} label="Categories" value={String(summary.totals.categories)} />
          <Stat icon={<CalendarIcon />} label="Period" value={range} compact />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 text-[13px]">
          <label className="flex items-center gap-2 text-[#6b7280]">
            Period
            <select
              aria-label="Period"
              className="cursor-pointer rounded-lg border border-[#ececec] bg-white px-3 py-1.5 text-[#111]"
              value={period}
              onChange={(event) => onPeriod(event.target.value as UsagePeriod)}
            >
              <option value="current">Current Period</option>
              <option value="previous">Previous Period</option>
              <option value="older">Usage Old</option>
            </select>
          </label>
          <span className="ml-auto text-[#6b7280]">{range}</span>
        </div>

        {period === "older" ? (
          <Notice
            title="Usage Old"
            body="Charges from before Aug 13, 2026."
            action="Back to current period"
            onAction={() => onPeriod("current")}
          />
        ) : (
          <Notice
            title="Earlier usage is still available"
            body="Usage before Aug 13, 2026 is available in Usage Old. Dates before the cut-off are disabled here."
            action="Open Usage Old"
            onAction={() => onPeriod("older")}
          />
        )}

        <div className="mx-auto mt-6 flex max-w-[520px] rounded-full bg-[#f3f3f4] p-1">
          <TabButton selected={tab === "overview"} onClick={() => setTab("overview")}>
            Overview
          </TabButton>
          <TabButton selected={tab === "detailed"} onClick={() => setTab("detailed")}>
            Detailed View
          </TabButton>
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-4 min-[721px]:flex-row">
          <div>
            <h2 className="text-[16px] font-semibold">{tab === "overview" ? "Detailed records" : `${selected?.name ?? "Usage"} usage executions`}</h2>
            <p className="mt-1 text-[13px] text-[#6b7280]">
              {tab === "overview"
                ? "Select a usage category, then open a record to inspect step costs."
                : `${selected?.executions ?? 0} executions in the selected period`}
            </p>
          </div>
          {summary.categories.length > 0 ? (
            <select
              aria-label="Usage category"
              className="cursor-pointer rounded-lg border border-[#ececec] bg-white px-3 py-2 text-[13px]"
              value={selected?.id ?? ""}
              onChange={(event) => chooseCategory(event.target.value)}
            >
              {summary.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} - {formatUsageAmount(category.debitedMicrocredits)}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {tab === "overview" ? (
          <div className="overflow-x-auto">
          <table className="mt-4 w-full min-w-[640px] text-left text-[14px]">
            <thead className="text-[13px] text-[#6b7280]">
              <tr>
                <SortHeader label="Tool Name" sortKey="name" sort={sort} onSort={toggleSort} />
                <SortHeader label="Total Debited" sortKey="debited" sort={sort} onSort={toggleSort} />
                <SortHeader label="Executions" sortKey="executions" sort={sort} onSort={toggleSort} />
                <SortHeader label="Latest Usage" sortKey="latest" sort={sort} onSort={toggleSort} />
                <th className="px-2 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border-t border-[#f3f3f4] py-8 text-center text-[#6b7280]">
                    No debited usage in this period.
                  </td>
                </tr>
              ) : null}
              {categories.map((category) => (
                <tr key={category.id} className="border-t border-[#f3f3f4]">
                  <td className="px-2 py-4">{category.name}</td>
                  <td className="px-2 py-4">{formatUsageAmount(category.debitedMicrocredits)}</td>
                  <td className="px-2 py-4">{category.executions}</td>
                  <td className="px-2 py-4">{category.latestUsageAt ? formatUsageTimestamp(category.latestUsageAt) : ""}</td>
                  <td className="px-2 py-4 text-right">
                    <Button type="button" variant="outline" className="cursor-pointer gap-2 rounded-full" aria-label={`View details for ${category.name}`} onClick={() => chooseCategory(category.id)}>
                      <EyeIcon />
                      View details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="mt-4 w-full min-w-[480px] text-left text-[14px]">
            <thead className="text-[13px] text-[#6b7280]">
              <tr>
                <th className="px-2 py-3 font-medium">Credits Used</th>
                <th className="px-2 py-3 font-medium">Timestamp</th>
                <th className="px-2 py-3 text-right font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {(selected?.rows.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={3} className="border-t border-[#f3f3f4] py-8 text-center text-[#6b7280]">
                    No executions in this category.
                  </td>
                </tr>
              ) : null}
              {selected?.rows.map((row) => (
                <tr key={row.id} className="border-t border-[#f3f3f4]">
                  <td className="px-2 py-4">{formatUsageAmount(row.debitedMicrocredits)}</td>
                  <td className="px-2 py-4">{formatUsageTimestamp(row.createdAt)}</td>
                  <td className="px-2 py-4 text-right">
                    <Button type="button" variant="outline" className="cursor-pointer gap-2 rounded-full" aria-label={`View details for ${row.id}`} onClick={() => setExecutionId(row.id)}>
                      <EyeIcon />
                      View details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Dialog open={execution !== null} onOpenChange={(open) => { if (!open) setExecutionId(null); }}>
        <DialogContent>
          {execution && selected ? (
            <>
              <DialogHeader>
                <ListIcon />
                <DialogTitle>Usage details</DialogTitle>
                <DialogClose className="ml-auto cursor-pointer px-2 text-[18px]" aria-label="Close">
                  ×
                </DialogClose>
              </DialogHeader>
              <DialogDescription className="sr-only">Step costs for this usage entry.</DialogDescription>
              <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-[#ececec] px-4 py-3 text-[13px] min-[721px]:grid-cols-3">
                <div>
                  <p className="text-[11px] font-medium tracking-wide text-[#6b7280]">MODEL</p>
                  <p className="mt-1 text-[14px]">{selected.name}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium tracking-wide text-[#6b7280]">TOTAL CREDITS</p>
                  <p className="mt-1 text-[14px]">{formatUsageAmount(execution.debitedMicrocredits)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium tracking-wide text-[#6b7280]">TIMESTAMP</p>
                  <p className="mt-1 text-[14px]">{formatUsageTimestamp(execution.createdAt)}</p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-semibold">Step breakdown</p>
                  <p className="text-[12px] text-[#6b7280]">Execution costs recorded for this usage entry</p>
                </div>
                <span className="rounded-full bg-[#f3f3f4] px-2 py-1 text-[12px] text-[#6b7280]">
                  {execution.steps.length} {execution.steps.length === 1 ? "step" : "steps"}
                </span>
              </div>
              <table className="mt-3 w-full text-left text-[14px]">
                <thead className="text-[13px] text-[#6b7280]">
                  <tr>
                    <th className="py-2 font-medium">Step</th>
                    <th className="py-2 font-medium">Timestamp</th>
                    <th className="py-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {execution.steps.map((step) => (
                    <tr key={`${step.name}-${step.createdAt}`} className="border-t border-[#f3f3f4]">
                      <td className="py-3">{step.name}</td>
                      <td className="py-3">{formatUsageTimestamp(step.createdAt)}</td>
                      <td className="py-3 text-right">{formatUsageAmount(step.debitedMicrocredits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function sortCategories(categories: UsageSummary["categories"], sort: { key: SortKey; direction: "asc" | "desc" }) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...categories].sort((left, right) => {
    if (sort.key === "name") return left.name.localeCompare(right.name) * direction;
    if (sort.key === "executions") return (left.executions - right.executions) * direction;
    if (sort.key === "debited") {
      const leftAmount = BigInt(left.debitedMicrocredits);
      const rightAmount = BigInt(right.debitedMicrocredits);
      if (leftAmount === rightAmount) return 0;
      return (leftAmount > rightAmount ? 1 : -1) * direction;
    }
    const leftTime = left.latestUsageAt ? new Date(left.latestUsageAt).getTime() : 0;
    const rightTime = right.latestUsageAt ? new Date(right.latestUsageAt).getTime() : 0;
    return (leftTime - rightTime) * direction;
  });
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; direction: "asc" | "desc" };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th className="px-2 py-3 font-medium">
      <button type="button" className="inline-flex cursor-pointer items-center gap-1" onClick={() => onSort(sortKey)}>
        {label}
        <span aria-hidden="true">{active ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

function Stat({ icon, label, value, suffix, compact }: { icon: ReactNode; label: string; value: string; suffix?: string; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#ececec] px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[#6b7280]">
        {icon}
        {label}
      </div>
      <p className={`mt-3 font-semibold text-[#1b1b1b] ${compact ? "text-[15px]" : "text-[22px]"}`}>
        {value}
        {suffix ? <span className="ml-1 text-[14px] font-normal text-[#6b7280]">{suffix}</span> : null}
      </p>
    </div>
  );
}

function Notice({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-[#ececec] px-4 py-3 min-[721px]:flex-row min-[721px]:items-center">
      <CalendarIcon />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">{title}</p>
        <p className="text-[13px] text-[#6b7280]">{body}</p>
      </div>
      <Button type="button" variant="outline" className="cursor-pointer rounded-lg" onClick={onAction}>
        {action} →
      </Button>
    </div>
  );
}

function TabButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`h-9 flex-1 cursor-pointer rounded-full text-[14px] ${selected ? "bg-white font-medium text-[#1b1b1b] shadow-sm" : "text-[#6b7280]"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10" />
      <path d="M15 9.5c0-1.2-1.3-2-3-2s-3 .8-3 2 1.3 2 3 2 3 .8 3 2-1.3 2-3 2-3-.8-3-2" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v6h6" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}
