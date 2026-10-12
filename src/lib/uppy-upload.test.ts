import { describe, expect, it } from "vitest";
import { assemblyIdFromUpload, declaredUpload, orderAssets } from "@/lib/uppy-upload";

describe("assembly id", () => {
  it("reads the id from the upload result when the completion event did not keep it", () => {
    const id = "a".repeat(32);
    expect(assemblyIdFromUpload({ transloadit: [{ assembly_id: id.toUpperCase() }], successful: [] }, "")).toBe(id);
    expect(assemblyIdFromUpload({ successful: [{ transloadit: { assembly: id } }] }, "")).toBe(id);
    expect(assemblyIdFromUpload({ successful: [] }, "")).toBe("");
  });
});

describe("upload declaration", () => {
  it("sends the file name, size, and mime to the signing route", () => {
    const file = new File(["hello"], "cat.png", { type: "image/png" });
    expect(declaredUpload(file)).toEqual({ name: "cat.png", size: 5, mime: "image/png" });
  });

  it("keeps attachment order when the stored names come back unsorted", () => {
    const files = [new File(["a"], "first.png", { type: "image/png" }), new File(["b"], "second.mp4", { type: "video/mp4" })];
    const ordered = orderAssets(files, [
      { originalName: "second.mp4" },
      { originalName: "first.png" },
    ]);
    expect(ordered.map((asset) => asset.originalName)).toEqual(["first.png", "second.mp4"]);
  });
});
