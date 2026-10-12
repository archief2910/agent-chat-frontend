import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { applyLiveAssistant, formatMagicaAmount, formatMicrocredits, MessageBlocks } from "@/components/message-blocks";

describe("message blocks", () => {
  it("shows a generated image and the tool fields that were saved", () => {
    render(
      <MessageBlocks
        blocks={[
          {
            type: "tool_use",
            id: "call_1",
            name: "gpt_image_2",
            input: { prompt: "a garden cat", size: "1024x1024" },
          },
          {
            type: "tool_result",
            toolUseId: "call_1",
            name: "gpt_image_2",
            isError: false,
            output: { image_url: "https://g.tlcdn.com/gen/cat.png", creditMicrocredits: "273936" },
          },
          { type: "asset", kind: "image", url: "https://g.tlcdn.com/gen/cat.png" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Completed 1 step" })).toBeTruthy();
    expect(screen.getByText("AI Generation")).toBeTruthy();
    expect(screen.getByText("Prompt")).toBeTruthy();
    expect(screen.getByText("a garden cat")).toBeTruthy();
    expect(screen.getByText("1024x1024")).toBeTruthy();
    expect(screen.getByText("0.27M")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Generated image" }).getAttribute("src")).toBe("https://g.tlcdn.com/gen/cat.png");
  });

  it("shows a tool error and ignores a non-http asset url", () => {
    render(
      <MessageBlocks
        blocks={[
          {
            type: "tool_use",
            id: "call_2",
            name: "crop_image",
            input: { image_url: "https://example.com/cat.png" },
          },
          {
            type: "tool_result",
            toolUseId: "call_2",
            name: "crop_image",
            isError: true,
            output: { error: "The model run failed." },
          },
          { type: "asset", kind: "image", url: "javascript:alert(1)" },
        ]}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("The model run failed.");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps saved text and appends only the unsaved stream suffix", () => {
    render(
      <MessageBlocks
        blocks={[{ type: "text", text: "Hello" }]}
        stream={{ text: "Hello there", thinking: "Looking" }}
      />,
    );
    expect(screen.getByText("Hello there")).toBeTruthy();
    expect(screen.queryByText(/Thinking/)).toBeNull();
    expect(screen.queryByText("Looking")).toBeNull();
  });

  it("shows thinking and stopping with progress, without the thinking text", () => {
    render(<MessageBlocks blocks={[]} phase="thinking" progress={20} />);
    expect(screen.getByText("Thinking · 20%")).toBeTruthy();
    render(<MessageBlocks blocks={[]} phase="stopping" progress={40} />);
    expect(screen.getByText("Stopping · 40%")).toBeTruthy();
  });

  it("shows skill steps, then the saved model schema, then the generation", () => {
    render(
      <MessageBlocks
        blocks={[
          { type: "thinking", text: "The user wants a cat.", durationMs: 1400 },
          { type: "tool_use", id: "skill_1", name: "load_skill", input: { name: "image-generation" } },
          { type: "tool_result", toolUseId: "skill_1", name: "load_skill", isError: false, output: { name: "image-generation", durationMs: 126 } },
          { type: "tool_use", id: "skill_2", name: "load_skill", input: { name: "image-generation" } },
          { type: "tool_result", toolUseId: "skill_2", name: "load_skill", isError: false, output: { durationMs: 1800 } },
          {
            type: "tool_use",
            id: "gen_1",
            name: "gpt_image_2",
            input: { prompt: "a fluffy tabby cat", size: "1024x1024", quality: "High", output_format: "PNG" },
          },
          {
            type: "tool_result",
            toolUseId: "gen_1",
            name: "gpt_image_2",
            isError: false,
            output: {
              image_url: "https://g.tlcdn.com/gen/cat.png",
              creditMicrocredits: "70000",
              durationMs: 40100,
              schemaModelId: "gpt-image-2.5-flare-text",
              schemaDurationMs: 2400,
            },
          },
        ]}
      />,
    );
    expect(screen.queryByText(/The user wants a cat/)).toBeNull();
    expect(screen.getByText("Thought for 1.4s")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Completed 4 steps" })).toBeTruthy();
    expect(screen.getAllByText("Skill")).toHaveLength(2);
    expect(screen.getByText(/126ms/)).toBeTruthy();
    expect(screen.getByText(/1\.8s/)).toBeTruthy();
    expect(screen.getByText("Model schema")).toBeTruthy();
    expect(screen.getByText("Model ID")).toBeTruthy();
    expect(screen.getAllByText("gpt-image-2.5-flare-text").length).toBeGreaterThan(0);
    expect(screen.getByText(/2\.4s/)).toBeTruthy();
    expect(screen.getByText("AI Generation")).toBeTruthy();
    expect(screen.getByText(/40\.1s/)).toBeTruthy();
    expect(screen.getByText("0.07M")).toBeTruthy();
    expect(screen.getByText("Quality")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
  });

  it("shows the known model after the skill while generation is still running", () => {
    render(
      <MessageBlocks
        blocks={[
          { type: "tool_use", id: "skill_1", name: "load_skill", input: { name: "image-generation" } },
          { type: "tool_result", toolUseId: "skill_1", name: "load_skill", isError: false, output: { durationMs: 126 } },
        ]}
        liveTools={[{ toolCallId: "gen_1", name: "gpt_image_2", status: "running", durationMs: null, chargedMicrocredits: "0", schemaModelId: "gpt-image-2.5-flare-text", schemaDurationMs: 2400 }]}
      />,
    );
    expect(screen.getByText("Skill")).toBeTruthy();
    expect(screen.getByText("Model schema")).toBeTruthy();
    expect(screen.getByText("gpt-image-2.5-flare-text")).toBeTruthy();
    expect(screen.getByText("AI Generation")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Working" })).toBeTruthy();
  });

  it("shows a started tool even when the saved message is still empty", () => {
    render(
      <MessageBlocks
        blocks={[]}
        working
        liveTools={[{ toolCallId: "skill_1", name: "load_skill", status: "running", durationMs: null, chargedMicrocredits: "0" }]}
      />,
    );
    expect(screen.getByText("Skill")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Working" })).toBeTruthy();
  });

  it("shows a tool that has started before its saved result arrives", () => {
    render(
      <MessageBlocks
        blocks={[{ type: "tool_use", id: "skill_1", name: "load_skill", input: { name: "image-generation" } }, { type: "tool_result", toolUseId: "skill_1", name: "load_skill", isError: false, output: { durationMs: 126 } }]}
        liveTools={[{ toolCallId: "gen_1", name: "gpt_image_2", status: "running", durationMs: null, chargedMicrocredits: "0" }]}
      />,
    );
    expect(screen.getByText("Skill")).toBeTruthy();
    expect(screen.getByText("AI Generation")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Working" })).toBeTruthy();
    expect(screen.queryByText("Model schema")).toBeNull();
  });

  it("formats microcredits the same way as the ledger", () => {
    expect(formatMicrocredits("273936")).toBe("0.273936");
    expect(formatMicrocredits("1000000")).toBe("1");
    expect(formatMagicaAmount("130000")).toBe("0.13M");
    expect(formatMagicaAmount("2080000")).toBe("2.08M");
  });

  it("overlays a longer live assistant message onto the saved row", () => {
    const saved = [{ id: "m1", status: "streaming", content: [{ type: "text" as const, text: "Hi" }] }];
    const live = {
      id: "m1",
      chatId: "chat_1",
      status: "streaming",
      content: [
        { type: "text" as const, text: "Hi" },
        { type: "asset" as const, kind: "image" as const, url: "https://g.tlcdn.com/gen/cat.png" },
      ],
    };
    expect(applyLiveAssistant(saved, live, "chat_1")[0]?.content).toHaveLength(2);
    expect(applyLiveAssistant(saved, live, "chat_2")).toEqual(saved);
    const foreign = applyLiveAssistant(saved, { ...live, id: "m2", chatId: "chat_other" }, "chat_1");
    expect(foreign).toEqual(saved);
  });
});
