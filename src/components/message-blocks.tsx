import { useState, type ReactNode } from "react";
import { DownloadButton } from "@/components/download-button";
import type { ContentBlock } from "@/generated/contracts";

const TOOL_LABELS: Record<string, string> = {
  crop_image: "Crop Image",
  gpt_image_2: "GPT Image 2",
  merge_videos: "Merge Videos",
  load_skill: "Load skill",
  read_skill_asset: "Read skill file",
};

const MICROCREDITS_PER_CREDIT = 1_000_000n;

export type AttachmentView = {
  position: number;
  asset: { kind: string; url: string | null; originalName: string | null };
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

/** Same split the backend uses: 1 credit = 1,000,000 microcredits. */
export function formatMicrocredits(value: string): string | null {
  if (!/^\d+$/.test(value)) return null;
  const microcredits = BigInt(value);
  const whole = microcredits / MICROCREDITS_PER_CREDIT;
  const fraction = (microcredits % MICROCREDITS_PER_CREDIT).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
}

/** Magica's header and tool rows show microcredits in millions, such as 0.13M or 28.44M. */
export function formatMagicaAmount(value: string): string | null {
  if (!/^\d+$/.test(value)) return null;
  const rounded = (BigInt(value) + 5_000n) / 10_000n;
  const whole = rounded / 100n;
  const fraction = (rounded % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return `${fraction ? `${whole.toString()}.${fraction}` : whole.toString()}M`;
}

export function applyLiveAssistant<T extends { id: string; content: ContentBlock[]; status: string }>(
  messages: T[],
  live: { id: string; chatId?: string; content: ContentBlock[]; status: string } | null | undefined,
  chatId?: string | null,
): T[] {
  if (!live) return messages;
  if (!chatId || (live.chatId && live.chatId !== chatId)) return messages;
  const index = messages.findIndex((message) => message.id === live.id);
  if (index < 0) return [...messages, live as T];
  return messages.map((message, position) => {
    if (position !== index) return message;
    const content = live.content.length >= message.content.length ? live.content : message.content;
    return { ...message, content, status: live.status };
  });
}

const FIELD_LABELS: Record<string, string> = {
  prompt: "Prompt",
  size: "Size",
  quality: "Quality",
  aspect_ratio: "Aspect Ratio",
  aspectRatio: "Aspect Ratio",
  resolution: "Resolution",
  duration: "Duration",
  model: "Model",
  modelId: "Model ID",
  subModelId: "Model ID",
  output_format: "Output Format",
  outputFormat: "Output Format",
};

const MEDIA_TOOLS = new Set(["gpt_image_2", "crop_image", "merge_videos"]);
const PRIMARY_FIELDS = ["Model", "Model ID", "Prompt", "Size", "Quality", "Output Format"];

type ToolCall = Extract<ContentBlock, { type: "tool_use" }>;
type ToolResult = Extract<ContentBlock, { type: "tool_result" }>;
type Step = { call: ToolCall; result?: ToolResult; running?: boolean };

export function MessageBlocks({
  blocks,
  stream,
  attachments = [],
  working = false,
  liveTools = [],
  phase,
  progress,
}: {
  blocks: ContentBlock[];
  stream?: { text: string; thinking: string };
  attachments?: AttachmentView[];
  working?: boolean;
  liveTools?: Array<{ toolCallId: string; name: string; status: string; durationMs: number | null; chargedMicrocredits: string; schemaModelId?: string; schemaDurationMs?: number }>;
  phase?: "queued" | "thinking" | "working" | "waiting" | "stopping" | "completed" | "failed" | "cancelled";
  progress?: number;
}) {
  const persistedText = blocks.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  const extraText = unsavedSuffix(persistedText, stream?.text);
  const lastText = lastIndex(blocks, "text");
  const steps = withLiveTools(collectSteps(blocks), liveTools);
  const shownUrls = new Set(steps.flatMap((step) => outputMedia(step.result?.output)));
  const nodes: ReactNode[] = [];

  attachments.forEach((item) => {
    const url = httpUrl(item.asset.url);
    if (!url) return;
    nodes.push(<Media key={`attachment-${item.position}`} kind={item.asset.kind} url={url} name={item.asset.originalName ?? "Attachment"} />);
  });

  if (phase === "thinking" || phase === "queued") {
    nodes.push(
      <p key="phase" className="text-[14px] text-[#6b7280]">
        {withProgress("Thinking", progress)}
      </p>,
    );
  }
  if (steps.length > 0) nodes.push(<Steps key="steps" steps={steps} phase={phase} progress={progress} />);
  else if (phase === "stopping") {
    nodes.push(
      <p key="stopping" className="text-[14px] text-[#6b7280]">
        {withProgress("Stopping", progress)}
      </p>,
    );
  } else if (working) {
    nodes.push(
      <p key="working" className="text-[14px] text-[#6b7280]">
        {withProgress("Working", progress)}
      </p>,
    );
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block || block.type === "tool_use" || block.type === "tool_result") continue;
    if (block.type === "thinking") {
      const label = durationLabel({ durationMs: block.durationMs });
      if (label) nodes.push(<p key={`think-${index}`} className="text-[13px] text-[#6b7280]">Thought for {label}</p>);
      continue;
    }
    if (block.type === "text") {
      const text = index === lastText ? `${block.text}${extraText}` : block.text;
      if (text) nodes.push(<p key={`text-${index}`}>{text}</p>);
      continue;
    }
    if (block.type === "asset") {
      const url = httpUrl(block.url);
      if (!url || shownUrls.has(url)) continue;
      nodes.push(<Media key={`asset-${index}`} kind={block.kind} url={url} name={`Generated ${block.kind}`} />);
      continue;
    }
    if (block.type === "citation") {
      const url = httpUrl(block.url);
      if (!url) continue;
      nodes.push(
        <p key={`citation-${index}`}>
          <a href={url} className="underline" target="_blank" rel="noreferrer">
            {block.title}
          </a>
        </p>,
      );
      continue;
    }
    if (block.type === "usage" && (block.promptTokens > 0 || block.completionTokens > 0)) {
      nodes.push(
        <p key="usage" className="text-[12px] text-[#6b7280]">
          {block.model} · {block.promptTokens} prompt tokens · {block.completionTokens} completion tokens
        </p>,
      );
    }
  }

  if (extraText && lastText < 0) nodes.push(<p key="live-text">{extraText}</p>);

  const spent = totalCharge(blocks);
  if (spent) {
    nodes.push(
      <p key="spent" className="mt-3 text-[13px] text-[#6b7280]">
        {spent} credits
      </p>,
    );
  }

  return <div className="mt-1 text-[15px] leading-6">{nodes}</div>;
}

function collectSteps(blocks: ContentBlock[]): Step[] {
  const results = new Map<string, ToolResult>();
  for (const block of blocks) {
    if (block.type === "tool_result") results.set(block.toolUseId, block);
  }
  return blocks.flatMap((block) => (block.type === "tool_use" ? [{ call: block, result: results.get(block.id) }] : []));
}

function withLiveTools(
  steps: Step[],
  liveTools: Array<{ toolCallId: string; name: string; status: string; durationMs: number | null; chargedMicrocredits: string; schemaModelId?: string; schemaDurationMs?: number }>,
): Step[] {
  const known = new Set(steps.map((step) => step.call.id));
  const extra: Step[] = liveTools.flatMap((tool): Step[] => {
    if (known.has(tool.toolCallId)) return [];
    const running = tool.status === "pending" || tool.status === "running";
    const call: ToolCall = { type: "tool_use", id: tool.toolCallId, name: tool.name, input: {} };
    const schemaOutput = tool.schemaModelId
      ? { schemaModelId: tool.schemaModelId, ...(typeof tool.schemaDurationMs === "number" ? { schemaDurationMs: tool.schemaDurationMs } : {}) }
      : null;
    if (running) {
      return [{
        call,
        running: true,
        ...(schemaOutput
          ? { result: { type: "tool_result" as const, toolUseId: tool.toolCallId, name: tool.name, isError: false, output: schemaOutput } }
          : {}),
      }];
    }
    const result: ToolResult = {
      type: "tool_result",
      toolUseId: tool.toolCallId,
      name: tool.name,
      isError: tool.status === "failed" || tool.status === "cancelled",
      output: {
        ...(tool.durationMs === null ? {} : { durationMs: tool.durationMs }),
        creditMicrocredits: tool.chargedMicrocredits,
        ...(schemaOutput ?? {}),
      },
    };
    return [{ call, result }];
  });
  return [...steps, ...extra];
}

function Steps({ steps, phase, progress }: { steps: Step[]; phase?: string; progress?: number }) {
  const rows = steps.flatMap(stepRows);
  const done = rows.every((row) => row.state !== "running");
  const [open, setOpen] = useState(true);
  const label = done ? `Completed ${rows.length} ${rows.length === 1 ? "step" : "steps"}` : withProgress(phase === "stopping" ? "Stopping" : "Working", progress);
  return (
    <section className="my-3 text-[14px]">
      <button type="button" className="inline-flex cursor-pointer items-center gap-1 font-medium text-[#1b1b1b]" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {label}
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <ol className="mt-2 grid gap-2">
          {rows.map((row) => (
            <StepRow key={row.id} row={row} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

type StepRowModel = {
  id: string;
  title: string;
  state: "done" | "failed" | "running";
  duration: string | null;
  charge: string | null;
  fields: Array<{ label: string; value: string }>;
  media: Array<{ kind: string; url: string }>;
  error: string | null;
  expandable: boolean;
};

function stepRows(step: Step): StepRowModel[] {
  const failed = step.running !== true && step.result?.isError === true;
  const pending = step.running === true || !step.result;
  const state = failed ? "failed" : pending ? "running" : "done";
  if (step.call.name === "load_skill" || step.call.name === "read_skill_asset") {
    return [{ id: step.call.id, title: "Skill", state, duration: durationLabel(step.result?.output), charge: null, fields: [], media: [], error: failed ? errorText(step.result?.output) : null, expandable: false }];
  }
  if (!MEDIA_TOOLS.has(step.call.name)) {
    return [{ id: step.call.id, title: toolLabel(step.call.name), state, duration: durationLabel(step.result?.output), charge: chargeLabel(step.result?.output), fields: [], media: [], error: failed ? errorText(step.result?.output) : null, expandable: false }];
  }
  const schema = schemaInfo(step.result?.output);
  const generation: StepRowModel = {
    id: step.call.id,
    title: "AI Generation",
    state,
    duration: durationLabel(step.result?.output),
    charge: failed ? null : chargeLabel(step.result?.output),
    fields: generationFields(step.call.input, schema?.modelId),
    media: outputMedia(step.result?.output).map((url) => ({ kind: mediaKind(step.call.name), url })),
    error: failed ? errorText(step.result?.output) : null,
    expandable: true,
  };
  if (!schema) return [generation];
  return [
    {
      id: `${step.call.id}:schema`,
      title: "Model schema",
      state: failed ? "failed" : "done",
      duration: durationLabel({ durationMs: schema.durationMs }),
      charge: null,
      fields: [{ label: "Model ID", value: schema.modelId }],
      media: [],
      error: null,
      expandable: true,
    },
    generation,
  ];
}

function StepRow({ row }: { row: StepRowModel }) {
  const [open, setOpen] = useState(row.expandable && row.state !== "running");
  const mark = row.state === "done" ? "✓" : row.state === "failed" ? "!" : "…";
  return (
    <li className="text-[14px]">
      <div className="flex items-center gap-2">
        <span className="text-[#6b7280]">{row.title === "Skill" ? "⚡" : row.title === "Model schema" ? "🔧" : "✦"}</span>
        <span>{row.title}</span>
        <span className={row.state === "failed" ? "text-red-600" : "text-[#16a34a]"} aria-label={row.state}>{mark}</span>
        {row.duration ? <span className="text-[#9ca3af]">◷ {row.duration}</span> : null}
        <span className="ml-auto flex items-center gap-2 text-[#6b7280]">
          {row.charge ? <span>{row.charge}</span> : null}
          {row.expandable ? (
            <button type="button" className="cursor-pointer px-1" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${row.title}`} onClick={() => setOpen((value) => !value)}>
              {open ? "▾" : "▸"}
            </button>
          ) : null}
        </span>
      </div>
      {open && row.fields.length > 0 ? <FieldCard fields={row.fields} media={row.media} /> : null}
      {row.error ? <ToolError output={{ error: row.error }} isError /> : null}
    </li>
  );
}

function FieldCard({ fields, media }: { fields: Array<{ label: string; value: string }>; media: Array<{ kind: string; url: string }> }) {
  const [more, setMore] = useState(false);
  const primary = fields.filter((field) => PRIMARY_FIELDS.includes(field.label));
  const extra = fields.filter((field) => !PRIMARY_FIELDS.includes(field.label));
  const visible = more ? fields : primary.length > 0 ? primary : fields.slice(0, 4);
  return (
    <div className="mt-2 rounded-xl border border-[#ececec] px-4 py-3">
      <dl className="grid gap-2">
        {visible.map((field) => (
          <div key={field.label} className="grid grid-cols-1 gap-1 min-[721px]:grid-cols-[140px_1fr] min-[721px]:gap-2">
            <dt className="text-[#6b7280]">{field.label}</dt>
            <dd className="min-w-0 whitespace-pre-wrap">{field.value}</dd>
          </div>
        ))}
      </dl>
      {extra.length > 0 ? (
        <button type="button" className="mt-2 cursor-pointer text-[13px] text-[#2563eb]" onClick={() => setMore((value) => !value)}>
          {more ? "View less" : "View more"}
        </button>
      ) : null}
      {media.map((item) => (
        <div key={item.url} className="mt-3 border-t border-[#f3f3f4] pt-3">
          <p className="mb-2 text-[#6b7280]">Output</p>
          <Media kind={item.kind} url={item.url} name={`Generated ${item.kind}`} framed />
        </div>
      ))}
    </div>
  );
}

function ToolError({ output, isError }: { output: unknown; isError: boolean }) {
  if (!isError) return null;
  const message = errorText(output);
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-[13px] text-red-700">
      {message}
    </p>
  );
}

function Media({ kind, url, name, framed = false }: { kind: string; url: string; name: string; framed?: boolean }) {
  const downloadClass = "absolute bottom-3 left-1/2 grid h-8 w-8 -translate-x-1/2 cursor-pointer place-items-center rounded-full bg-white text-[#111] shadow";
  if (kind === "image") {
    return (
      <figure className={framed ? "relative w-full max-w-[280px] overflow-hidden" : "relative mt-2 w-full overflow-hidden"}>
        <img src={url} alt={name} className="block max-h-[320px] w-full rounded-xl object-contain" />
        <DownloadButton url={url} name={name} className={downloadClass} />
      </figure>
    );
  }
  if (kind === "video") {
    return (
      <figure className="relative mt-2 w-full overflow-hidden">
        <video src={url} controls className="block max-h-[320px] w-full rounded-xl bg-black" />
        <DownloadButton url={url} name={name} className={downloadClass} />
      </figure>
    );
  }
  if (kind === "audio") return <audio src={url} controls className="mt-2 w-full" />;
  return (
    <p className="mt-2">
      <DownloadButton url={url} name={name} label={name} className="cursor-pointer underline" />
    </p>
  );
}

function inputFields(input: unknown): Array<{ label: string; value: string }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const fields: Array<{ label: string; value: string }> = [];
  for (const [label, value] of Object.entries(input)) {
    if (label === "externalRunId") continue;
    if (FIELD_LABELS[label] && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
      fields.push({ label: FIELD_LABELS[label], value: String(value) });
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      fields.push({ label, value: String(value) });
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      fields.push({ label, value: value.join(", ") });
    }
  }
  return fields;
}

function withProgress(label: string, progress?: number): string {
  return progress && progress > 0 ? `${label} · ${progress}%` : label;
}

function durationLabel(output: unknown): string | null {
  const raw = output && typeof output === "object" && !Array.isArray(output) ? (output as { durationMs?: unknown }).durationMs : undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  if (raw < 1000) return `${Math.round(raw)}ms`;
  if (raw < 60_000) return `${(raw / 1000).toFixed(1)}s`;
  const minutes = Math.floor(raw / 60_000);
  const seconds = Math.round((raw % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function schemaInfo(output: unknown): { modelId: string; durationMs: number } | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const modelId = (output as { schemaModelId?: unknown }).schemaModelId;
  const durationMs = (output as { schemaDurationMs?: unknown }).schemaDurationMs;
  if (typeof modelId !== "string" || modelId.length === 0) return null;
  return { modelId, durationMs: typeof durationMs === "number" ? durationMs : 0 };
}

function generationFields(input: unknown, modelId: string | undefined): Array<{ label: string; value: string }> {
  const fields = inputFields(input).filter((field) => field.label !== "Model ID" && field.label !== "Model");
  if (modelId) fields.unshift({ label: "Model", value: modelId });
  return fields;
}

function outputMedia(output: unknown): string[] {
  if (!output || typeof output !== "object" || Array.isArray(output)) return [];
  const record = output as Record<string, unknown>;
  const urls = [record.image_url, record.video_url, record.audio_url];
  return urls.flatMap((value) => {
    const url = typeof value === "string" ? httpUrl(value) : null;
    return url ? [url] : [];
  });
}

function mediaKind(toolName: string): string {
  if (toolName === "merge_videos") return "video";
  return "image";
}

function chargeLabel(output: unknown): string | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const raw = (output as { creditMicrocredits?: unknown }).creditMicrocredits;
  if (typeof raw !== "string" || raw === "0") return null;
  return formatMagicaAmount(raw);
}

function totalCharge(blocks: ContentBlock[]): string | null {
  let sum = 0n;
  for (const block of blocks) {
    if (block.type !== "tool_result" || block.isError) continue;
    const raw = block.output && typeof block.output === "object" && !Array.isArray(block.output)
      ? (block.output as { creditMicrocredits?: unknown }).creditMicrocredits
      : undefined;
    if (typeof raw === "string" && /^\d+$/.test(raw)) sum += BigInt(raw);
  }
  if (sum === 0n) return null;
  return formatMagicaAmount(sum.toString());
}

function errorText(output: unknown): string | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const error = (output as { error?: unknown }).error;
  return typeof error === "string" && error.length > 0 ? error : null;
}

function unsavedSuffix(saved: string, live: string | undefined): string {
  if (!live || live.length <= saved.length || !live.startsWith(saved)) return "";
  return live.slice(saved.length);
}

function lastIndex(blocks: ContentBlock[], type: ContentBlock["type"]): number {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index]?.type === type) return index;
  }
  return -1;
}

export function httpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
