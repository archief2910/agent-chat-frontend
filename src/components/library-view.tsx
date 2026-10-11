"use client";

import { useMemo, useState } from "react";
import { DownloadButton } from "@/components/download-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  LIBRARY_TYPES,
  filterLibrary,
  groupLibrary,
  libraryBadge,
  libraryName,
  type LibraryAsset,
  type LibraryDate,
  type LibrarySort,
  type LibrarySource,
  type LibraryType,
} from "@/lib/library";

export function LibraryView({
  assets,
  favorites,
  now,
  onToggleFavorite,
  onUpload,
}: {
  assets: LibraryAsset[];
  favorites: string[];
  now: Date;
  onToggleFavorite: (id: string) => void;
  onUpload: (files: File[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<LibrarySource>("all");
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [date, setDate] = useState<LibraryDate>("any");
  const [customDate, setCustomDate] = useState("");
  const [types, setTypes] = useState<LibraryType[]>([]);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [picked, setPicked] = useState<string[]>([]);
  const visible = useMemo(
    () => filterLibrary(assets, { query, source, sort, date, customDate, types, favorites, now }),
    [assets, customDate, date, favorites, now, query, sort, source, types],
  );
  const groups = groupLibrary(visible, now);
  const temporary = assets.some((asset) => asset.source === "generated" && asset.isTemporaryUrl);

  function toggleType(type: LibraryType) {
    setTypes((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]));
  }

  function togglePicked(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 min-[721px]:px-8 min-[721px]:py-8">
      <div className="mb-5 flex flex-col items-start justify-between gap-4 min-[721px]:flex-row min-[721px]:items-center">
        <h1 className="text-[28px] font-semibold">Library</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="cursor-pointer rounded-full">Sort</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[240px] p-3">
              <p className="mb-2 text-[12px] text-[#6b7280]">Sort by</p>
              <SortChoice label="Newest First" selected={sort === "newest"} onClick={() => setSort("newest")} />
              <SortChoice label="Oldest First" selected={sort === "oldest"} onClick={() => setSort("oldest")} />
              <div className="mt-3 flex items-center justify-between text-[12px] text-[#6b7280]">
                <span>Date</span>
                <button type="button" className="cursor-pointer" onClick={() => { setDate("any"); setCustomDate(""); }}>Reset</button>
              </div>
              {(["today", "yesterday", "7", "30"] as const).map((value) => (
                <SortChoice key={value} label={dateLabel(value)} selected={date === value} onClick={() => setDate(value)} />
              ))}
              <label className="mt-2 block text-[13px]">
                Custom Date
                <input type="date" aria-label="Custom date" className="mt-1 w-full rounded-md border border-[#ececec] px-2 py-1" value={customDate} onChange={(event) => { setCustomDate(event.target.value); setDate("custom"); }} />
              </label>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="cursor-pointer rounded-full">Filter</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[240px] p-3">
              <input aria-label="Filter types" className="mb-2 w-full rounded-md border border-[#ececec] px-2 py-1.5 text-[13px]" placeholder="Filter..." onChange={(event) => {
                const text = event.target.value.trim().toLowerCase();
                const match = LIBRARY_TYPES.find(([, label]) => label.toLowerCase().includes(text));
                if (match && text) setTypes([match[0]]);
                if (!text) setTypes([]);
              }} />
              {LIBRARY_TYPES.map(([type, label]) => (
                <label key={type} className="flex cursor-pointer items-center justify-between py-1.5 text-[14px]">
                  {label}
                  <input type="checkbox" checked={types.includes(type)} aria-label={label} onChange={() => toggleType(type)} />
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <Button type="button" variant="outline" className="cursor-pointer rounded-full" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}>Grid</Button>
          <Button type="button" variant="outline" className="cursor-pointer rounded-full" aria-pressed={layout === "list"} onClick={() => setLayout("list")}>List</Button>
          <label className="cursor-pointer rounded-full bg-black px-4 py-2 text-[14px] text-white">
            Upload media
            <input type="file" accept="image/*,video/*,audio/*" multiple className="sr-only" aria-label="Upload media" onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              if (files.length > 0) onUpload(files);
              event.target.value = "";
            }} />
          </label>
        </div>
      </div>
      <input aria-label="Search media" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media..." className="mb-3 w-full rounded-xl border border-[#ececec] px-4 py-3 text-[14px] outline-none" />
      <p className="mb-3 text-[13px] text-[#6b7280]">{assets.length} files</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <SourceChip label="All" selected={source === "all"} onClick={() => setSource("all")} />
        <SourceChip label="Generated" selected={source === "generated"} onClick={() => setSource("generated")} />
        <SourceChip label="My Uploads" selected={source === "upload"} onClick={() => setSource("upload")} />
        <SourceChip label="Favorites" selected={source === "favorites"} onClick={() => setSource("favorites")} />
      </div>
      {temporary ? (
        <p className="mb-4 rounded-xl bg-[#e8f1ff] px-4 py-3 text-[13px] text-[#1d4ed8]">Some generated links are temporary. Download files you want to keep.</p>
      ) : null}
      <div className="flex gap-8">
        <div className="min-w-0 flex-1">
          {groups.length === 0 ? <p className="py-8 text-[14px] text-[#6b7280]">No files in this view.</p> : null}
          {groups.map((group) => (
            <section key={group.label} className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-[14px] font-medium">{group.label}</h2>
                  <p className="text-[12px] text-[#6b7280]">{group.count}</p>
                </div>
                <input
                  type="checkbox"
                  aria-label={`Select ${group.label}`}
                  checked={group.items.every((item) => picked.includes(item.id))}
                  onChange={() => {
                    const ids = group.items.map((item) => item.id);
                    const all = ids.every((id) => picked.includes(id));
                    setPicked((current) => (all ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]));
                  }}
                />
              </div>
              <ul className={layout === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3" : "grid gap-2"}>
                {group.items.map((asset) => (
                  <LibraryCard key={asset.id} asset={asset} picked={picked.includes(asset.id)} favorite={favorites.includes(asset.id)} onPick={() => togglePicked(asset.id)} onFavorite={() => onToggleFavorite(asset.id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <aside className="hidden w-[180px] shrink-0 min-[721px]:block">
          <p className="rounded-lg bg-[#f3f3f4] px-3 py-2 text-[13px]">All</p>
          <p className="mt-4 text-[13px] text-[#6b7280]">My folders</p>
          <p className="mt-2 text-[12px] text-[#9ca3af]">No folders yet.</p>
        </aside>
      </div>
    </div>
  );
}

function LibraryCard({
  asset,
  picked,
  favorite,
  onPick,
  onFavorite,
}: {
  asset: LibraryAsset;
  picked: boolean;
  favorite: boolean;
  onPick: () => void;
  onFavorite: () => void;
}) {
  const name = libraryName(asset);
  return (
    <li className="group overflow-hidden rounded-xl border border-[#ececec]">
      <div className="relative h-[140px] bg-[#f6f6f7]">
        {asset.kind === "image" && asset.url ? <img src={asset.url} alt={name} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[12px] uppercase text-[#6b7280]">{asset.kind}</span>}
        <div className="absolute inset-x-2 top-2 flex justify-between opacity-100 min-[721px]:opacity-0 min-[721px]:group-hover:opacity-100">
          <input type="checkbox" aria-label={`Select ${name}`} checked={picked} onChange={onPick} />
          <span className="flex gap-1">
            {asset.url ? <DownloadButton url={asset.url} name={name} label={`Download ${name}`} className="grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-white text-[12px] shadow" /> : null}
            <button type="button" aria-label={favorite ? `Unfavorite ${name}` : `Favorite ${name}`} className="grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-white text-[12px] shadow" onClick={onFavorite}>{favorite ? "♥" : "♡"}</button>
          </span>
        </div>
      </div>
      <p className="truncate px-2 py-2 text-[12px]"><span className="mr-1 text-[#6b7280]">{libraryBadge(asset)}</span>{name}</p>
    </li>
  );
}

function SourceChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`cursor-pointer rounded-full px-3 py-1.5 text-[13px] ${selected ? "bg-[#3f3f46] text-white" : "bg-[#f3f3f4] text-[#3f3f46]"}`} onClick={onClick}>
      {label}
    </button>
  );
}

function SortChoice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className="flex w-full cursor-pointer items-center gap-2 py-1.5 text-left text-[14px]" onClick={onClick}>
      <span aria-hidden="true">{selected ? "●" : "○"}</span>
      {label}
    </button>
  );
}

function dateLabel(date: "today" | "yesterday" | "7" | "30"): string {
  if (date === "today") return "Today";
  if (date === "yesterday") return "Yesterday";
  if (date === "7") return "Last 7 Days";
  return "Last 30 Days";
}
