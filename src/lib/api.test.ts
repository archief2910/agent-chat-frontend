import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApi } from "@/lib/api";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = createApi({ baseUrl: "http://localhost:3001", getToken: async () => "test-token" });

describe("api client", () => {
  it("sends plan mode only when the composer has it on", async () => {
    let body: unknown;
    server.use(
      http.post("http://localhost:3001/api/v1/chats/chat_1/messages", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          chatId: "chat_1",
          messageId: "msg_1",
          assistantMessageId: "msg_2",
          runId: "run_1",
          status: "queued",
          replayed: false,
          realtime: { token: null, triggerRunId: null, streamId: "agent-output" },
        });
      }),
    );
    await api.sendMessage("chat_1", {
      clientMessageId: "8d8b6c3e-4f0a-4e3b-9c1d-6a7b8c9d0e1f",
      text: "crop the cat",
      planMode: true,
    });
    expect(body).toMatchObject({ planMode: true, text: "crop the cat" });
  });

  it("posts one waitpoint answer", async () => {
    let body: unknown;
    server.use(
      http.post("http://localhost:3001/api/v1/waitpoints/wait_1/respond", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          id: "wait_1",
          kind: "plan",
          status: "answered",
          request: { summary: "Crop the cat", steps: ["crop_image"] },
          expiresAt: "2026-10-11T10:00:00.000Z",
          replayed: false,
        });
      }),
    );
    const result = await api.respondWaitpoint("wait_1", { approved: true });
    expect(body).toEqual({ response: { approved: true } });
    expect(result.replayed).toBe(false);
    expect(result.status).toBe("answered");
  });

  it("loads the usage summary for the selected period", async () => {
    let period = "";
    server.use(
      http.get("http://localhost:3001/api/v1/usage", ({ request }) => {
        period = new URL(request.url).searchParams.get("period") ?? "";
        return HttpResponse.json({
          balanceMicrocredits: "10000000",
          credits: "10",
          period: { id: "current", from: "2026-10-01T00:00:00.000Z", to: "2026-10-12T00:00:00.000Z" },
          totals: { debitedMicrocredits: "0", executions: 0, categories: 0 },
          categories: [],
        });
      }),
    );
    const result = await api.usage("current");
    expect(period).toBe("current");
    expect(result.credits).toBe("10");
    expect(result.categories).toEqual([]);
  });

  it("loads every saved upload and generated file page", async () => {
    let cursor = "";
    server.use(
      http.get("http://localhost:3001/api/v1/assets", ({ request }) => {
        cursor = new URL(request.url).searchParams.get("cursor") ?? "";
        return HttpResponse.json({
          assets: [
            {
              id: "asset_1",
              kind: "image",
              source: "generated",
              mime: "image/png",
              bytes: "1200",
              originalName: "cat.png",
              url: "https://cdn.example/cat.png",
              isTemporaryUrl: true,
              createdAt: "2026-10-12T00:00:00.000Z",
            },
          ],
          nextCursor: null,
        });
      }),
    );
    const page = await api.listAssets("cursor_1");
    expect(cursor).toBe("cursor_1");
    expect(page.assets[0]?.source).toBe("generated");
    expect(page.assets[0]?.originalName).toBe("cat.png");
  });
});

