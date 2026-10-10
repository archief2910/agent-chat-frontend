import { assetSchema } from "@/generated/contracts";
import { z } from "zod";

export type LibraryAsset = z.infer<typeof assetSchema>;
export type LibrarySource = "all" | "generated" | "upload" | "favorites";
export type LibrarySort = "newest" | "oldest";
export type LibraryDate = "any" | "today" | "yesterday" | "7" | "30" | "custom";
export type LibraryType = "image" | "video" | "audio" | "pdf" | "word" | "sheet" | "slides" | "code";

const TYPE_LABELS: Record<LibraryType, string> = {
  image: "Images",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  word: "Word",
  sheet: "Spreadsheet",
  slides: "Presentation",
  code: "Code & Text",
};

export const LIBRARY_TYPES = Object.entries(TYPE_LABELS) as Array<[LibraryType, string]>;

export function libraryName(asset: Pick<LibraryAsset, "originalName" | "url" | "kind">): string {
  if (asset.originalName && asset.originalName.trim().length > 0) return asset.originalName;
  if (asset.url) {
    try {
      const name = new URL(asset.url).pathname.split("/").pop();
      if (name) return decodeURIComponent(name);
    } catch {
      // The stored address is not a URL. Fall through to the kind.
    }
  }
  return asset.kind;
}

export function libraryBadge(asset: Pick<LibraryAsset, "mime" | "originalName">): string {
  const ext = asset.originalName?.split(".").pop();
  if (ext && ext !== asset.originalName && ext.length <= 5) return ext.toUpperCase();
  if (asset.mime.includes("png")) return "PNG";
  if (asset.mime.includes("jpeg")) return "JPEG";
  if (asset.mime.includes("webp")) return "WEBP";
  if (asset.mime.includes("gif")) return "GIF";
  if (asset.mime.includes("mp4")) return "MP4";
  if (asset.mime.includes("webm")) return "WEBM";
  if (asset.mime.includes("mpeg") || asset.mime.includes("mp3")) return "MP3";
  if (asset.mime.includes("wav")) return "WAV";
  if (asset.mime.includes("pdf")) return "PDF";
  return asset.mime.split("/")[1]?.slice(0, 5).toUpperCase() || "FILE";
}

export function matchesLibraryType(asset: LibraryAsset, type: LibraryType): boolean {
  const mime = asset.mime.toLowerCase();
  const name = libraryName(asset).toLowerCase();
  if (type === "image") return asset.kind === "image" || mime.startsWith("image/");
  if (type === "video") return asset.kind === "video" || mime.startsWith("video/");
  if (type === "audio") return asset.kind === "audio" || mime.startsWith("audio/");
  if (type === "pdf") return mime.includes("pdf") || name.endsWith(".pdf");
  if (type === "word") return mime.includes("word") || /\.docx?$/.test(name);
  if (type === "sheet") return mime.includes("sheet") || mime.includes("csv") || /\.(xlsx?|csv)$/.test(name);
  if (type === "slides") return mime.includes("presentation") || /\.pptx?$/.test(name);
  return mime.startsWith("text/") || /\.(js|ts|tsx|py|json|html|css|txt|md)$/.test(name);
}

export function filterLibrary(
  assets: LibraryAsset[],
  options: {
    query: string;
    source: LibrarySource;
    sort: LibrarySort;
    date: LibraryDate;
    customDate: string;
    types: LibraryType[];
    favorites: string[];
    now: Date;
  },
): LibraryAsset[] {
  const query = options.query.trim().toLowerCase();
  const filtered = assets.filter((asset) => {
    if (query && !libraryName(asset).toLowerCase().includes(query)) return false;
    if (options.source === "generated" && asset.source !== "generated") return false;
    if (options.source === "upload" && asset.source !== "upload") return false;
    if (options.source === "favorites" && !options.favorites.includes(asset.id)) return false;
    if (options.types.length > 0 && !options.types.some((type) => matchesLibraryType(asset, type))) return false;
    return matchesDate(asset.createdAt, options.date, options.customDate, options.now);
  });
  return filtered.sort((left, right) => {
    const delta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return options.sort === "oldest" ? delta : -delta;
  });
}

export function groupLibrary(assets: LibraryAsset[], now: Date): Array<{ label: string; count: string; items: LibraryAsset[] }> {
  const groups = new Map<string, { label: string; items: LibraryAsset[] }>();
  for (const asset of assets) {
    const created = new Date(asset.createdAt);
    const key = dayKey(created);
    const current = groups.get(key) ?? { label: sameDay(created, now) ? "Today" : formatLibraryDay(created), items: [] };
    current.items.push(asset);
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    count: `${String(group.items.length).padStart(2, "0")} Items`,
  }));
}

function matchesDate(createdAt: string, date: LibraryDate, customDate: string, now: Date): boolean {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  if (date === "any") return true;
  if (date === "today") return sameDay(created, now);
  if (date === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return sameDay(created, yesterday);
  }
  if (date === "custom") {
    if (!customDate) return true;
    const [year, month, day] = customDate.split("-").map(Number);
    if (!year || !month || !day) return true;
    return created.getFullYear() === year && created.getMonth() === month - 1 && created.getDate() === day;
  }
  const days = date === "7" ? 7 : 30;
  const start = new Date(now);
  start.setDate(now.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return created.getTime() >= start.getTime() && created.getTime() <= now.getTime();
}

function sameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatLibraryDay(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
