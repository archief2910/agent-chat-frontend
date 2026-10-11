"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type ThemeChoice = "system" | "light" | "night";

export function readTheme(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  const saved = window.localStorage.getItem("theme");
  return saved === "light" || saved === "night" || saved === "system" ? saved : "system";
}

export function applyTheme(choice: ThemeChoice) {
  const night = choice === "night" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = night ? "night" : "light";
  window.localStorage.setItem("theme", choice);
}

export function SidebarAccount({
  creditsLabel,
  onOpenSettings,
}: {
  creditsLabel: string;
  onOpenSettings: (tab: "account" | "preferences") => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>("system");

  useEffect(() => {
    const choice = readTheme();
    setTheme(choice);
    applyTheme(choice);
  }, []);

  function choose(next: ThemeChoice) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div className="border-t border-[#ececec] p-2">
      {open ? (
        <div className="mb-2 px-1">
          <button type="button" className="mb-2 flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[#ececef]" onClick={() => setOpen(false)}>
            <span aria-hidden="true">⋮</span> Less
          </button>
          <div className="mb-2 flex items-center justify-between px-2 text-[13px]">
            <span className="text-[#6b7280]">Available Credits</span>
            <span className="font-medium">{creditsLabel}</span>
          </div>
          <button type="button" className="mb-2 h-10 w-full cursor-pointer rounded-full bg-black text-[14px] text-white transition-colors duration-150 hover:bg-neutral-800" onClick={() => router.push("/usage")}>
            View usage
          </button>
          <button type="button" className="mb-2 flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[#ececef]" onClick={() => onOpenSettings("account")}>
            Settings
          </button>
          <ThemePreference theme={theme} onChoose={choose} />
        </div>
      ) : (
        <button type="button" className="mb-1 flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[#3f3f46] transition-colors duration-150 hover:bg-[#ececef]" onClick={() => setOpen(true)}>
          <span className="text-[#6b7280]">⋯</span> More
        </button>
      )}
    </div>
  );
}

export function ThemePreference({ theme, onChoose }: { theme?: ThemeChoice; onChoose?: (choice: ThemeChoice) => void }) {
  const [local, setLocal] = useState<ThemeChoice>(theme ?? "system");
  useEffect(() => {
    if (theme) setLocal(theme);
    else setLocal(readTheme());
  }, [theme]);
  function choose(next: ThemeChoice) {
    setLocal(next);
    applyTheme(next);
    onChoose?.(next);
  }
  const current = theme ?? local;
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="px-2 text-[13px] text-[#6b7280]">Theme</span>
      <div className="flex items-center gap-1 rounded-full border border-[#ececec] p-1" role="group" aria-label="Theme">
        <ThemeButton label="System theme" selected={current === "system"} onClick={() => choose("system")}>▣</ThemeButton>
        <ThemeButton label="Light theme" selected={current === "light"} onClick={() => choose("light")}>☀</ThemeButton>
        <ThemeButton label="Night theme" selected={current === "night"} onClick={() => choose("night")}>☾</ThemeButton>
      </div>
    </div>
  );
}

function ThemeButton({ label, selected, onClick, children }: { label: string; selected: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-label={label} aria-pressed={selected} className={`grid h-8 w-10 cursor-pointer place-items-center rounded-full text-[14px] transition-colors duration-150 ${selected ? "bg-[#f3f3f4]" : "hover:bg-[#f6f6f7]"}`} onClick={onClick}>
      {children}
    </button>
  );
}
