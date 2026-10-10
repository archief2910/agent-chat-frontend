import { z } from "zod";
import {
  assetSchema,
  chatSchema,
  completedUploadSchema,
  createAssemblyResponseSchema,
  creditBalanceSchema,
  messageSchema,
  modelStatusSchema,
  runSnapshotSchema,
  sendMessageBodySchema,
  sendMessageResponseSchema,
  usagePeriodSchema,
  usageSummarySchema,
  waitpointSummarySchema,
} from "@/generated/contracts";

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    traceId: z.string(),
    details: z.unknown().optional(),
  }),
});

const chatListSchema = z.object({
  pinned: z.array(chatSchema),
  chats: z.array(chatSchema),
  nextCursor: z.string().nullable(),
});

const messageListSchema = z.object({
  messages: z.array(messageSchema),
  nextCursor: z.string().nullable(),
});

const waitpointResultSchema = waitpointSummarySchema.extend({ replayed: z.boolean() });

const realtimeSchema = z.object({
  token: z.string().nullable(),
  triggerRunId: z.string().nullable(),
  streamId: z.literal("agent-output"),
});

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly traceId: string;
  readonly details?: unknown;

  constructor(status: number, body: z.infer<typeof errorSchema>["error"]) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.retryable = body.retryable;
    this.traceId = body.traceId;
    if (body.details !== undefined) this.details = body.details;
  }
}

export function createApi(options: { baseUrl: string; getToken: () => Promise<string | null> }) {
  async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    const token = await options.getToken();
    let response: Response;
    try {
      response = await fetch(`${options.baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init?.headers,
        },
      });
    } catch {
      throw new ApiError(0, {
        code: "NETWORK",
        message: "The server could not be reached. Check your connection and try again.",
        retryable: true,
        traceId: "local",
      });
    }
    const text = await response.text();
    const json = text ? safeJson(text) : {};
    if (!response.ok) {
      const parsed = errorSchema.safeParse(json);
      if (parsed.success) throw new ApiError(response.status, parsed.data.error);
      throw new ApiError(response.status, {
        code: "INTERNAL",
        message: "The server returned an unexpected error.",
        retryable: response.status >= 500,
        traceId: response.headers.get("x-request-id") ?? "unknown",
      });
    }
    return schema.parse(json);
  }

  return {
    listChats: (q?: string) => {
      const params = new URLSearchParams();
      if (q?.trim()) params.set("q", q.trim());
      const suffix = params.size > 0 ? `?${params.toString()}` : "";
      return request(`/api/v1/chats${suffix}`, chatListSchema);
    },
    createChat: () => request("/api/v1/chats", chatSchema, { method: "POST", body: "{}" }),
    updateChat: (chatId: string, body: { title?: string; pinned?: boolean }) =>
      request(`/api/v1/chats/${encodeURIComponent(chatId)}`, chatSchema, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    duplicateChat: (chatId: string) =>
      request(`/api/v1/chats/${encodeURIComponent(chatId)}/duplicate`, chatSchema, { method: "POST" }),
    deleteChat: (chatId: string) =>
      request(`/api/v1/chats/${encodeURIComponent(chatId)}`, z.object({ deleted: z.literal(true) }), { method: "DELETE" }),
    listMessages: (chatId: string) => request(`/api/v1/chats/${chatId}/messages`, messageListSchema),
    sendMessage: (chatId: string, body: z.infer<typeof sendMessageBodySchema>) =>
      request(`/api/v1/chats/${chatId}/messages`, sendMessageResponseSchema, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getRun: (runId: string) => request(`/api/v1/runs/${runId}`, runSnapshotSchema),
    cancelRun: (runId: string) => request(`/api/v1/runs/${runId}/cancel`, runSnapshotSchema, { method: "POST" }),
    retryRun: (runId: string) =>
      request(`/api/v1/runs/${runId}/retry`, sendMessageResponseSchema, {
        method: "POST",
        body: JSON.stringify({ clientMessageId: crypto.randomUUID() }),
      }),
    realtimeToken: (runId: string) => request(`/api/v1/runs/${runId}/realtime-token`, realtimeSchema, { method: "POST" }),
    respondWaitpoint: (waitpointId: string, response: unknown) =>
      request(`/api/v1/waitpoints/${encodeURIComponent(waitpointId)}/respond`, waitpointResultSchema, {
        method: "POST",
        body: JSON.stringify({ response }),
      }),
    credits: () => request("/api/v1/credits", creditBalanceSchema),
    usage: (period: z.infer<typeof usagePeriodSchema> = "current") =>
      request(`/api/v1/usage?period=${encodeURIComponent(period)}`, usageSummarySchema),
    createAssembly: (files: Array<{ name: string; size: number; mime: string }>) =>
      request("/api/v1/uploads/assemblies", createAssemblyResponseSchema, {
        method: "POST",
        body: JSON.stringify({ files }),
      }),
    completeUpload: (uploadId: string, assemblyId: string) =>
      request(`/api/v1/uploads/${encodeURIComponent(uploadId)}/complete`, completedUploadSchema, {
        method: "POST",
        body: JSON.stringify({ assemblyId }),
      }),
    listAssets: (cursor?: string) => {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const suffix = `?${params.toString()}`;
      return request(`/api/v1/assets${suffix}`, z.object({ assets: z.array(assetSchema), nextCursor: z.string().nullable() }));
    },
    model: () => request("/api/v1/models", modelStatusSchema),
  };
}

export type Api = ReturnType<typeof createApi>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

export function runIdFrom(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.details || typeof error.details !== "object") return null;
  const runId = (error.details as { runId?: unknown }).runId;
  return typeof runId === "string" ? runId : null;
}
