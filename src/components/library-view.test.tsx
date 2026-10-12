import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LibraryView } from "@/components/library-view";
import { filterLibrary, groupLibrary, type LibraryAsset } from "@/lib/library";

const now = new Date("2026-10-12T12:00:00");

function asset(patch: Partial<LibraryAsset> & Pick<LibraryAsset, "id" | "source" | "createdAt">): LibraryAsset {
  return {
    kind: "image",
    mime: "image/png",
    bytes: "10",
    originalName: patch.id,
    url: `https://cdn.example/${patch.id}.png`,
    isTemporaryUrl: false,
    ...patch,
  };
}

const uploaded = asset({ id: "upload_1", source: "upload", originalName: "lollipop.png", createdAt: now.toISOString() });
const generated = asset({ id: "gen_1", source: "generated", originalName: "cat.png", createdAt: "2026-10-10T12:00:00", isTemporaryUrl: true });

describe("library files", () => {
  it("keeps uploads and generated files, and can show only one source", () => {
    const all = filterLibrary([uploaded, generated], {
      query: "",
      source: "all",
      sort: "newest",
      date: "any",
      customDate: "",
      types: [],
      favorites: [],
      now,
    });
    expect(all.map((item) => item.id)).toEqual(["upload_1", "gen_1"]);
    const made = filterLibrary([uploaded, generated], {
      query: "cat",
      source: "generated",
      sort: "oldest",
      date: "any",
      customDate: "",
      types: ["image"],
      favorites: [],
      now,
    });
    expect(made.map((item) => item.originalName)).toEqual(["cat.png"]);
  });

  it("groups today's files separately from older days", () => {
    const groups = groupLibrary([uploaded, generated], now);
    expect(groups[0]?.label).toBe("Today");
    expect(groups[0]?.count).toBe("01 Items");
    expect(groups[1]?.label).toBe("Saturday, October 10, 2026");
    expect(groups[1]?.count).toBe("01 Items");
  });
});

describe("library page", () => {
  it("shows saved uploads and generated images, then filters to generated", () => {
    render(<LibraryView assets={[uploaded, generated]} favorites={[]} now={now} onToggleFavorite={vi.fn()} onUpload={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Library" })).toBeTruthy();
    expect(screen.getByText("2 files")).toBeTruthy();
    expect(screen.getByText("lollipop.png")).toBeTruthy();
    expect(screen.getByText("cat.png")).toBeTruthy();
    expect(screen.getByText("Some generated links are temporary. Download files you want to keep.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Generated" }));
    expect(screen.queryByText("lollipop.png")).toBeNull();
    expect(screen.getByText("cat.png")).toBeTruthy();
  });
});
