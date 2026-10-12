import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreditsMenu } from "@/components/credits-menu";
import { UsageView, type UsageSummary } from "@/components/usage-view";
import { formatUsageAmount } from "@/lib/usage-format";

const summary: UsageSummary = {
  balanceMicrocredits: "22490000",
  credits: "22.49",
  period: { id: "current", from: "2026-10-01T00:00:00.000Z", to: "2026-10-12T18:00:00.000Z" },
  totals: { debitedMicrocredits: "3345000", executions: 3, categories: 3 },
  categories: [
    {
      id: "ai-agent-chat",
      name: "AI Agent Chat",
      debitedMicrocredits: "50000",
      executions: 1,
      latestUsageAt: "2026-10-11T18:03:10.000Z",
      rows: [
        {
          id: "run_chat",
          debitedMicrocredits: "50000",
          createdAt: "2026-10-11T18:03:10.000Z",
          steps: [{ name: "AI LLM Admission Reservation", createdAt: "2026-10-11T18:03:10.000Z", debitedMicrocredits: "50000" }],
        },
      ],
    },
    {
      id: "ai-gpt-image-2",
      name: "AI Gpt Image 2",
      debitedMicrocredits: "3290000",
      executions: 1,
      latestUsageAt: "2026-10-11T17:51:57.000Z",
      rows: [
        {
          id: "tool_image",
          debitedMicrocredits: "3290000",
          createdAt: "2026-10-11T17:51:57.000Z",
          steps: [{ name: "AI Gpt Image 2", createdAt: "2026-10-11T17:51:57.000Z", debitedMicrocredits: "3290000" }],
        },
      ],
    },
  ],
};

describe("credits menu", () => {
  it("opens the hobby balance and sends View usage to the usage page", () => {
    const onAddCredits = vi.fn();
    render(<CreditsMenu label="22.49M" onAddCredits={onAddCredits} />);
    fireEvent.click(screen.getByRole("button", { name: "Available credits 22.49M" }));
    expect(screen.getByText("HOBBY")).toBeTruthy();
    expect(screen.getByText("Available Credits")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View usage" }));
    expect(onAddCredits).toHaveBeenCalledOnce();
  });
});

describe("usage page", () => {
  it("formats small charges with four decimals and larger charges with two", () => {
    expect(formatUsageAmount("0")).toBe("0.0000M");
    expect(formatUsageAmount("5000")).toBe("0.0050M");
    expect(formatUsageAmount("50000")).toBe("0.05M");
    expect(formatUsageAmount("3290000")).toBe("3.29M");
  });

  it("opens a category and then the step breakdown", () => {
    const onPeriod = vi.fn();
    render(<UsageView summary={summary} period="current" onPeriod={onPeriod} />);
    expect(screen.getByRole("heading", { name: "AI Credits Overview" })).toBeTruthy();
    expect(screen.getByText("3.35M")).toBeTruthy();
    expect(screen.getAllByText("AI Gpt Image 2").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Open Usage Old →" }));
    expect(onPeriod).toHaveBeenCalledWith("older");

    fireEvent.click(screen.getByRole("button", { name: "View details for AI Agent Chat" }));
    expect(screen.getByRole("heading", { name: "AI Agent Chat usage executions" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View details for run_chat" }));
    expect(screen.getByRole("heading", { name: "Usage details" })).toBeTruthy();
    expect(screen.getByText("AI LLM Admission Reservation")).toBeTruthy();
    expect(screen.getAllByText("0.05M").length).toBeGreaterThan(0);
  });
});
