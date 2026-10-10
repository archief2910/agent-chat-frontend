import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

describe("shadcn button", () => {
  it("renders the upload label", () => {
    render(<Button type="button">+ Upload</Button>);
    expect(screen.getByRole("button", { name: "+ Upload" })).toBeTruthy();
  });
});
