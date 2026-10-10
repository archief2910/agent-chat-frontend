import { streams } from "@trigger.dev/sdk";

/** Must stay aligned with agent-chat-backend/src/trigger/streams.ts */
export const agentOutput = streams.define<{ seq: number; kind: "text" | "thinking"; delta: string }>({
  id: "agent-output",
});
