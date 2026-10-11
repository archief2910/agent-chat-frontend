"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function CreditsMenu({ label, onAddCredits }: { label: string; onAddCredits: () => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Available credits ${label}`}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#e6e6e6] bg-white px-3 py-1 text-[13px] text-[#111] hover:bg-[#f6f6f7]"
        >
          <span aria-hidden="true">✦</span>
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px]">
        <p className="text-[12px] font-medium tracking-[0.08em] text-[#6b7280]">HOBBY</p>
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="text-[14px] text-[#6b7280]">Available Credits</p>
          <p className="text-[22px] font-semibold leading-none text-[#111]">{label}</p>
        </div>
        <Button type="button" aria-label="View usage" className="mt-4 h-11 w-full cursor-pointer gap-2 rounded-full text-[14px]" onClick={onAddCredits}>
          <CardIcon />
          View usage
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function CardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}
