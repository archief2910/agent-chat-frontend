import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { httpUrl } from "@/components/message-blocks";

const http = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "http:" || url.protocol === "https:";
}, "Use an http or https URL.");

const optionsRequest = z.object({
  question: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
  allowMultiple: z.boolean().optional(),
});

const planRequest = z.object({
  summary: z.string(),
  steps: z.array(z.string()).min(1),
});

const creditRequest = z.object({
  toolName: z.string(),
  estimatedMicrocredits: z.string(),
  credits: z.string(),
});

const mediaRequest = z.object({
  question: z.string(),
  media: z.array(z.object({ url: http, kind: z.enum(["image", "video", "audio"]) })).min(1),
});

export function WaitpointCard({
  kind,
  request,
  pending,
  onRespond,
}: {
  kind: "options" | "plan" | "credit" | "media";
  request: unknown;
  pending: boolean;
  onRespond: (response: { approved?: boolean; selected?: string[] }) => void;
}) {
  if (kind === "options") return <OptionsCard request={request} pending={pending} onRespond={onRespond} />;
  if (kind === "plan") return <ApprovalCard title="Approve this plan" request={request} pending={pending} onRespond={onRespond} />;
  if (kind === "credit") return <CreditCard request={request} pending={pending} onRespond={onRespond} />;
  return <MediaCard request={request} pending={pending} onRespond={onRespond} />;
}

function OptionsCard({
  request,
  pending,
  onRespond,
}: {
  request: unknown;
  pending: boolean;
  onRespond: (response: { selected: string[] }) => void;
}) {
  const parsed = optionsRequest.safeParse(request);
  const [selected, setSelected] = useState<string[]>([]);
  if (!parsed.success) return <Unavailable />;
  const multiple = parsed.data.allowMultiple === true;
  return (
    <section className="rounded-xl border border-[#ececec] px-3 py-3 text-[14px]" aria-label="Choose an option">
      <p className="font-medium">{parsed.data.question}</p>
      <div className="mt-2 grid gap-2">
        {parsed.data.options.map((option) => (
          <label key={option.id} className="flex items-center gap-2">
            <input
              type={multiple ? "checkbox" : "radio"}
              name="waitpoint-option"
              value={option.id}
              checked={selected.includes(option.id)}
              onChange={() => {
                if (!multiple) {
                  setSelected([option.id]);
                  return;
                }
                setSelected((current) => (current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id]));
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
      <Button
        type="button"
        className="mt-3"
        disabled={pending || selected.length === 0}
        onClick={() => {
          if (pending || selected.length === 0) return;
          onRespond({ selected });
        }}
      >
        Continue
      </Button>
    </section>
  );
}

function ApprovalCard({
  title,
  request,
  pending,
  onRespond,
}: {
  title: string;
  request: unknown;
  pending: boolean;
  onRespond: (response: { approved: boolean }) => void;
}) {
  const parsed = planRequest.safeParse(request);
  if (!parsed.success) return <Unavailable />;
  return (
    <section className="rounded-xl border border-[#ececec] px-3 py-3 text-[14px]" aria-label={title}>
      <p className="font-medium">{title}</p>
      <p className="mt-2">{parsed.data.summary}</p>
      <ol className="mt-2 list-decimal pl-5">
        {parsed.data.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="mt-3 flex gap-2">
        <Button type="button" disabled={pending} onClick={() => onRespond({ approved: true })}>
          Approve
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => onRespond({ approved: false })}>
          Decline
        </Button>
      </div>
    </section>
  );
}

function CreditCard({
  request,
  pending,
  onRespond,
}: {
  request: unknown;
  pending: boolean;
  onRespond: (response: { approved: boolean }) => void;
}) {
  const parsed = creditRequest.safeParse(request);
  if (!parsed.success) return <Unavailable />;
  return (
    <section className="rounded-xl border border-[#ececec] px-3 py-3 text-[14px]" aria-label="Approve the credit charge">
      <p className="font-medium">Approve the credit charge</p>
      <p className="mt-2">
        {parsed.data.toolName} · estimated {parsed.data.credits} credits
      </p>
      <div className="mt-3 flex gap-2">
        <Button type="button" disabled={pending} onClick={() => onRespond({ approved: true })}>
          Approve
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => onRespond({ approved: false })}>
          Decline
        </Button>
      </div>
    </section>
  );
}

function MediaCard({
  request,
  pending,
  onRespond,
}: {
  request: unknown;
  pending: boolean;
  onRespond: (response: { approved: boolean }) => void;
}) {
  const parsed = mediaRequest.safeParse(request);
  if (!parsed.success) return <Unavailable />;
  return (
    <section className="rounded-xl border border-[#ececec] px-3 py-3 text-[14px]" aria-label="Approve the media">
      <p className="font-medium">{parsed.data.question}</p>
      <div className="mt-2 grid gap-2">
        {parsed.data.media.map((item) => {
          const url = httpUrl(item.url);
          if (!url) return null;
          if (item.kind === "image") return <img key={url} src={url} alt="Media for approval" className="max-w-full rounded-lg" />;
          if (item.kind === "video") return <video key={url} src={url} controls className="max-w-full rounded-lg" />;
          return <audio key={url} src={url} controls className="w-full" />;
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" disabled={pending} onClick={() => onRespond({ approved: true })}>
          Approve
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => onRespond({ approved: false })}>
          Decline
        </Button>
      </div>
    </section>
  );
}

function Unavailable() {
  return <p className="text-[13px] text-[#6b7280]">This approval could not be shown.</p>;
}
