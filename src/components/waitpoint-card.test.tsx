import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WaitpointCard } from "@/components/waitpoint-card";

describe("waitpoint card", () => {
  it("sends the selected option once", () => {
    const onRespond = vi.fn();
    render(
      <WaitpointCard
        kind="options"
        request={{ question: "Which crop?", options: [{ id: "square", label: "Square" }, { id: "wide", label: "Wide" }] }}
        pending={false}
        onRespond={onRespond}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onRespond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Square" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(onRespond).toHaveBeenCalledWith({ selected: ["square"] });
  });

  it("sends a plan decline", () => {
    const onRespond = vi.fn();
    render(
      <WaitpointCard
        kind="plan"
        request={{ summary: "Crop the cat", steps: ["crop_image"] }}
        pending={false}
        onRespond={onRespond}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(onRespond).toHaveBeenCalledWith({ approved: false });
  });

  it("shows nothing actionable when the request does not match the contract", () => {
    const onRespond = vi.fn();
    render(<WaitpointCard kind="credit" request={{ unexpected: true }} pending={false} onRespond={onRespond} />);
    expect(screen.getByText("This approval could not be shown.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});
