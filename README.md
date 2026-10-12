# Agent Chat frontend

Chat client for the agent API. The shell follows the Galaxy screenshots already captured. It is not a pixel-measured copy of the live product.

## Setup

```bash
cp .env.example .env.local
corepack pnpm install
corepack pnpm dev
```

The app listens on port 3000 and calls `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3001`). Sign-in uses Clerk. The backend must list this origin in `FRONTEND_ORIGIN`.

Response bodies are parsed with the backend's Zod contracts in `src/generated/contracts.ts`. Do not edit that file. Regenerate it from the backend with `corepack pnpm contracts:sync`. `contracts:check` fails if this copy is stale.

## What you can do

Create a chat, send a message, attach files, answer a plan or credit wait, stop a run, retry a failed or cancelled run, search, pin, and delete chats, and resume the active run after a reload. While a run is active the page holds a Trigger.dev realtime subscription for run metadata and the `agent-output` stream. `GET /runs/:id` loads the saved snapshot when that metadata changes, when the run finishes, and about every three seconds only if the subscription is down.

## Architecture overview

This app is a client of the backend. It does not call OpenRouter, Magica, or Transloadit. Clerk supplies the bearer token. TanStack Query loads chats, messages, the run, and credits. Zustand holds the live text stream for the active run. The message list uses TanStack Virtual so a long chat does not mount every row.

## Design decisions and trade-offs

- **The message list is virtualized.** Rows are measured as they render. The view stays pinned to the latest message unless you scroll up.
- **The database wins over the stream.** Trigger.dev is the live channel. Postgres is read when the run metadata changes and once when the run finishes. The one-second poll is not the live path.
- **Contracts are generated.** `src/generated/contracts.ts` is a hash-checked copy of the backend schemas. The client parses responses with those schemas instead of trusting `any`.
- **The shell is not pixel-measured.** Sidebar, empty state, and composer follow the screenshots. Tool cards and approvals use the saved contract fields, not a traced Galaxy overlay.

## What I would improve with more time

- Match spacing, type, tool cards, and the artifact panel against the live product, side by side.
- Cover send, upload, stop, retry, and a long virtualized thread in the browser. Playwright currently checks that the home page answers.
