"use client";

import { useAuth, useClerk, useUser, UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useRealtimeRunWithStreams } from "@trigger.dev/react-hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ContentBlock } from "@/generated/contracts";
import { applyLiveAssistant, MessageBlocks, type AttachmentView } from "@/components/message-blocks";
import { CreditsMenu } from "@/components/credits-menu";
import { SidebarAccount, ThemePreference } from "@/components/sidebar-account";
import { downloadFile } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { WaitpointCard } from "@/components/waitpoint-card";
import { ApiError, createApi, runIdFrom } from "@/lib/api";
import { UploadCancelled, uploadFiles } from "@/lib/uppy-upload";
import { useRunStore } from "@/stores/run-store";

const terminal = new Set(["completed", "failed", "cancelled"]);
const chips = ["All", "Viral Video Formats", "Video Special Effects", "Content Creation", "Branding & Design", "Image & Editing"];

type PendingFile = {
  localId: string;
  name: string;
  previewUrl: string | null;
  progress: number;
  status: "uploading" | "ready" | "failed";
  error: string | null;
  assetId: string | null;
  temporary: boolean;
  file: File | null;
};

export function ChatWorkspace({ chatId, view = "chat" }: { chatId: string | null; view?: "chat" | "tasks" }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const api = useMemo(
    () => createApi({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001", getToken }),
    [getToken],
  );
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [active, setActive] = useState<{ runId: string; token: string | null; triggerRunId: string | null } | null>(null);
  const [realtime, setRealtime] = useState<"idle" | "open" | "down">("idle");
  const seenMeta = useRef<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [fileFilter, setFileFilter] = useState<TaskFileKind | "all">("all");
  const [pickedFiles, setPickedFiles] = useState<string[]>([]);
  const [menuChatId, setMenuChatId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [settings, setSettings] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectingTasks, setSelectingTasks] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(max-width: 720px)").matches) setSidebarOpen(false);
  }, []);
  const [chatQuery, setChatQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const uploadControllers = useRef(new Map<string, AbortController>());

  const chats = useQuery({ queryKey: ["chats", chatQuery], queryFn: () => api.listChats(chatQuery) });
  const credits = useQuery({ queryKey: ["credits"], queryFn: () => api.credits() });
  const library = useQuery({ queryKey: ["assets"], queryFn: () => api.listAssets(), enabled: libraryOpen });
  const messages = useQuery({
    queryKey: ["messages", chatId],
    queryFn: () => api.listMessages(chatId ?? ""),
    enabled: Boolean(chatId),
  });
  const run = useQuery({
    queryKey: ["run", active?.runId],
    queryFn: () => api.getRun(active?.runId ?? ""),
    enabled: Boolean(active?.runId) && Boolean(chatId),
    refetchInterval: (query) => {
      if (query.state.data && terminal.has(query.state.data.status)) return false;
      // The open Trigger.dev subscription is the live path. Poll only if that socket is down.
      if (active?.token && active.triggerRunId && realtime !== "down") return false;
      return 3000;
    },
  });

  useEffect(() => {
    setRealtime("idle");
    seenMeta.current = null;
  }, [active?.runId, active?.triggerRunId]);

  const onRealtime = useCallback((next: "open" | "down") => {
    setRealtime((current) => (current === next ? current : next));
  }, []);
  const onRealtimeActivity = useCallback(
    (updatedAt: string) => {
      if (!active?.runId || seenMeta.current === updatedAt) return;
      seenMeta.current = updatedAt;
      void queryClient.invalidateQueries({ queryKey: ["run", active.runId] });
      void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
    },
    [active?.runId, chatId, queryClient],
  );
  const onRealtimeDone = useCallback(() => {
    if (!active?.runId) return;
    void queryClient.invalidateQueries({ queryKey: ["run", active.runId] });
    void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
    void queryClient.invalidateQueries({ queryKey: ["credits"] });
  }, [active?.runId, chatId, queryClient]);

  const selected = [...(chats.data?.pinned ?? []), ...(chats.data?.chats ?? [])].find((chat) => chat.id === chatId);

  useEffect(() => {
    const activeRunId = selected?.activeRunId;
    if (!activeRunId) return;
    let cancelled = false;
    const client = createApi({
      baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
      getToken,
    });
    client
      .realtimeToken(activeRunId)
      .then((token) => {
        if (!cancelled) setActive({ runId: activeRunId, token: token.token, triggerRunId: token.triggerRunId });
      })
      .catch((error: unknown) => {
        if (!cancelled) setBanner(error instanceof ApiError ? error.message : "The active run could not be restored.");
      });
    return () => {
      cancelled = true;
    };
  }, [getToken, selected?.activeRunId]);

  const send = useMutation({
    mutationFn: async (input: { text: string; planMode: boolean; attachments: Array<{ assetId: string; position: number }> }) => {
      let id = chatId;
      if (!id) {
        const chat = await api.createChat();
        id = chat.id;
      }
      return api.sendMessage(id, {
        clientMessageId: crypto.randomUUID(),
        text: input.text,
        ...(input.planMode ? { planMode: true } : {}),
        ...(input.attachments.length > 0 ? { attachments: input.attachments } : {}),
      });
    },
    onSuccess: async (result, variables) => {
      setDraft("");
      setPending((current) => current.filter((item) => !variables.attachments.some((attachment) => attachment.assetId === item.assetId)));
      setBanner(null);
      setActive({ runId: result.runId, token: result.realtime.token, triggerRunId: result.realtime.triggerRunId });
      await queryClient.invalidateQueries({ queryKey: ["messages", result.chatId] });
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
      if (chatId !== result.chatId) router.push(`/c/${result.chatId}`);
    },
    onError: async (error: unknown) => {
      const existing = runIdFrom(error);
      if (error instanceof ApiError && error.code === "RUN_ACTIVE" && existing) {
        const token = await api.realtimeToken(existing).catch(() => null);
        setActive({ runId: existing, token: token?.token ?? null, triggerRunId: token?.triggerRunId ?? null });
        setBanner("This chat already has an active run. Showing that run instead of starting another.");
        return;
      }
      setBanner(error instanceof ApiError ? `${error.message} (${error.traceId})` : "The message could not be sent.");
    },
  });

  const retry = useMutation({
    mutationFn: () => api.retryRun(active?.runId ?? ""),
    onSuccess: async (result) => {
      setBanner(null);
      setActive({ runId: result.runId, token: result.realtime.token, triggerRunId: result.realtime.triggerRunId });
      await queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
    onError: (error: unknown) => setBanner(error instanceof ApiError ? error.message : "The turn could not be retried."),
  });

  const removeChat = useMutation({
    mutationFn: (id: string) => api.deleteChat(id),
    onSuccess: async (_result, id) => {
      if (chatId === id) {
        setActive(null);
        router.push("/");
      }
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
    onError: (error: unknown) => setBanner(error instanceof ApiError ? error.message : "The chat could not be deleted."),
  });

  const renameChat = useMutation({
    mutationFn: (input: { id: string; title: string }) => api.updateChat(input.id, { title: input.title }),
    onSuccess: async () => {
      setMenuChatId(null);
      setMenuAnchor(null);
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
    onError: (error: unknown) => setBanner(error instanceof ApiError ? error.message : "The task could not be renamed."),
  });

  const duplicateChat = useMutation({
    mutationFn: (id: string) => api.duplicateChat(id),
    onSuccess: async (chat) => {
      setMenuChatId(null);
      setMenuAnchor(null);
      router.push(`/c/${chat.id}`);
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
    onError: (error: unknown) => setBanner(error instanceof ApiError ? error.message : "The task could not be duplicated."),
  });

  const pinChat = useMutation({
    mutationFn: (input: { id: string; pinned: boolean }) => api.updateChat(input.id, { pinned: input.pinned }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
    onError: (error: unknown) => setBanner(error instanceof ApiError ? error.message : "The chat could not be updated."),
  });

  const cancel = useMutation({
    mutationFn: () => api.cancelRun(active?.runId ?? ""),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["run", active?.runId] });
    },
    onError: (error: unknown) => setBanner(error instanceof ApiError ? error.message : "The run could not be stopped."),
  });

  const respond = useMutation({
    mutationFn: (input: { waitpointId: string; response: { approved?: boolean; selected?: string[] } }) =>
      api.respondWaitpoint(input.waitpointId, input.response),
    onSuccess: async () => {
      setBanner(null);
      await queryClient.invalidateQueries({ queryKey: ["run", active?.runId] });
    },
    onError: (error: unknown) => setBanner(error instanceof ApiError ? error.message : "The answer could not be saved."),
  });

  const scopedRun = run.data?.chatId === chatId ? run.data : undefined;
  const ordered = applyLiveAssistant([...(messages.data?.messages ?? [])].reverse(), scopedRun?.assistantMessage, chatId);
  const taskFiles = filesInChat(ordered);
  const pendingWait = scopedRun?.waitpoint?.status === "pending" ? scopedRun.waitpoint : null;
  const taskList = [...(chats.data?.pinned ?? []), ...(chats.data?.chats ?? [])];
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Account";
  const stream = useRunStore((state) => (scopedRun && active ? state.streams[active.runId] : undefined));
  const status = scopedRun?.status;
  const running = Boolean(status && !terminal.has(status));

  useEffect(() => {
    if (!status || !terminal.has(status)) return;
    void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
    void queryClient.invalidateQueries({ queryKey: ["credits"] });
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
  }, [chatId, queryClient, status]);

  const openChat = (id?: string | null) => {
    setSettings(null);
    setFilesOpen(false);
    setUploadOpen(false);
    setMenuChatId(null);
    router.push(id ? `/c/${id}` : "/");
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (event.key === "Escape") {
        if (settings) {
          setSettings(null);
          return;
        }
        if (uploadOpen) {
          setUploadOpen(false);
          return;
        }
        if (running) cancel.mutate();
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        openChat(null);
        return;
      }
      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSidebarOpen(true);
        setSearchOpen(true);
        queueMicrotask(() => document.getElementById("chat-search")?.focus());
        return;
      }
      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarOpen((open) => !open);
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        if (active?.runId) cancel.mutate();
        setActive(null);
        return;
      }
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        if (view === "chat") submitDraft();
        return;
      }
      if (event.key === "Tab" && event.shiftKey && target?.id === "composer") {
        event.preventDefault();
        setPlanMode((value) => !value);
        return;
      }
      if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !typing) {
        const nodes = [...document.querySelectorAll<HTMLElement>("[data-message]")];
        if (nodes.length === 0) return;
        event.preventDefault();
        const current = nodes.findIndex((node) => node === document.activeElement);
        const next = event.key === "ArrowDown" ? Math.min(nodes.length - 1, current + 1) : Math.max(0, current - 1);
        nodes[next]?.focus();
        return;
      }
      if ((event.key === "Home" || event.key === "End") && !typing) {
        const nodes = [...document.querySelectorAll<HTMLElement>("[data-message]")];
        if (nodes.length === 0) return;
        event.preventDefault();
        (event.key === "Home" ? nodes[0] : nodes[nodes.length - 1])?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active?.runId, cancel, openChat, running, settings, submitDraft, uploadOpen, view]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
  }, []);

  function closeSidebarOnNarrow() {
    if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
  }

  async function runUpload(localId: string, file: File) {
    const controller = new AbortController();
    uploadControllers.current.set(localId, controller);
    setPending((current) => current.map((item) => (item.localId === localId ? { ...item, status: "uploading", error: null, progress: 0 } : item)));
    try {
      const completed = await uploadFiles(api, [file], {
        signal: controller.signal,
        onProgress: ({ percentage }) => {
          setPending((current) => current.map((item) => (item.localId === localId ? { ...item, progress: percentage } : item)));
        },
      });
      const asset = completed.assets[0];
      if (!asset) throw new Error("The upload finished without a file.");
      setPending((current) =>
        current.map((item) => {
          if (item.localId !== localId) return item;
          if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
          return { ...item, status: "ready", progress: 100, assetId: asset.id, temporary: asset.isTemporaryUrl, previewUrl: asset.url, error: null };
        }),
      );
    } catch (error) {
      if (error instanceof UploadCancelled) {
        setPending((current) => {
          const item = current.find((entry) => entry.localId === localId);
          if (item?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
          return current.filter((entry) => entry.localId !== localId);
        });
        return;
      }
      const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : "The upload failed.";
      setPending((current) => current.map((item) => (item.localId === localId ? { ...item, status: "failed", error: message } : item)));
    } finally {
      uploadControllers.current.delete(localId);
    }
  }

  function addFiles(list: File[]) {
    const room = 8 - pending.length;
    const chosen = list.slice(0, Math.max(0, room));
    if (list.length > chosen.length) setBanner("Attach at most 8 files.");
    const rows: PendingFile[] = chosen.map((file) => ({
      localId: crypto.randomUUID(),
      name: file.name,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      progress: 0,
      status: "uploading",
      error: null,
      assetId: null,
      temporary: false,
      file,
    }));
    setPending((current) => [...current, ...rows]);
    setUploadOpen(false);
    for (const row of rows) {
      if (row.file) void runUpload(row.localId, row.file);
    }
  }

  function addLibraryAsset(asset: { id: string; originalName: string | null; url: string | null; kind: string; isTemporaryUrl: boolean }) {
    setPending((current) => {
      if (current.some((item) => item.assetId === asset.id) || current.length >= 8) return current;
      return [
        ...current,
        {
          localId: crypto.randomUUID(),
          name: asset.originalName ?? "File",
          previewUrl: asset.kind === "image" ? asset.url : null,
          progress: 100,
          status: "ready",
          error: null,
          assetId: asset.id,
          temporary: asset.isTemporaryUrl,
          file: null,
        },
      ];
    });
    setLibraryOpen(false);
    setUploadOpen(false);
  }

  function removePending(localId: string) {
    uploadControllers.current.get(localId)?.abort();
    uploadControllers.current.delete(localId);
    setPending((current) => {
      const item = current.find((entry) => entry.localId === localId);
      if (item?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.localId !== localId);
    });
  }

  function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    if (pending.some((item) => item.status === "uploading")) {
      setBanner("Wait for the upload to finish, or cancel it.");
      return;
    }
    if (pending.some((item) => item.status === "failed")) {
      setBanner("A file failed to upload. Retry it or remove it before sending.");
      return;
    }
    const attachments = pending.flatMap((item, position) => (item.assetId ? [{ assetId: item.assetId, position }] : []));
    send.mutate({ text, planMode, attachments });
  }

  return (
    <div className="flex h-screen bg-white text-[#1b1b1b] antialiased">
      {sidebarOpen ? (
        <button type="button" aria-label="Close sidebar" className="fixed inset-0 z-10 bg-black/40 min-[721px]:hidden" onClick={() => setSidebarOpen(false)} />
      ) : null}
      {sidebarOpen ? null : (
        <nav aria-label="Collapsed menu" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[#ececec] bg-white py-3">
          <RailButton label="Open sidebar" onClick={() => setSidebarOpen(true)}><PanelIcon /></RailButton>
          <RailButton label="Search" onClick={() => { setSidebarOpen(true); setSearchOpen(true); }}><SearchIcon /></RailButton>
          <RailButton label="New task" onClick={() => openChat(null)}><PlusIcon /></RailButton>
          <RailButton label="Tasks" onClick={() => router.push("/tasks")}><TasksIcon /></RailButton>
          <RailButton label="Library" onClick={() => router.push("/library")}><LibraryIcon /></RailButton>
          <RailButton label="API / MCP" onClick={() => { window.location.assign("https://agent-chat.mintlify.site/"); }}><ApiIcon /></RailButton>
          <div className="mt-auto">
            <RailButton label="Settings" onClick={() => setSettings("account")}><GearIcon /></RailButton>
          </div>
        </nav>
      )}
      <aside className={`${sidebarOpen ? "absolute inset-y-0 left-0 z-20 flex min-[721px]:static" : "hidden"} w-[232px] shrink-0 flex-col border-r border-[#ececec] bg-white`}>
        <div className="flex items-center justify-between px-4 py-4">
          <img src="/magica-wordmark.png" alt="Magica" className="h-5 w-auto" />
          <span className="flex gap-2 text-[#6b7280]">
            <IconButton label="Search" onClick={() => setSearchOpen((open) => !open)}>
              <SearchIcon />
            </IconButton>
            <IconButton label="Toggle sidebar" onClick={() => setSidebarOpen(false)}>
              <PanelIcon />
            </IconButton>
          </span>
        </div>
        {searchOpen ? (
          <label className="block px-3 pb-2">
            <span className="sr-only">Search tasks</span>
            <input
              value={chatQuery}
              id="chat-search"
              onChange={(event) => setChatQuery(event.target.value)}
              className="w-full rounded-md border border-[#ececec] bg-white px-2 py-1.5 text-[13px] outline-none"
              placeholder="Search tasks"
            />
          </label>
        ) : null}
        <nav className="px-2 text-[14px] text-[#3f3f46]">
          <SideItem label="New task" detail="Ctrl+Shift+O" icon={<PlusIcon />} onClick={() => openChat(null)} />
          <SideItem label="Tasks" icon={<TasksIcon />} active={view === "tasks"} onClick={() => router.push("/tasks")} />
          <SideItem label="Library" icon={<LibraryIcon />} onClick={() => router.push("/library")} />
          <SideItem label="API / MCP" icon={<ApiIcon />} onClick={() => { window.location.assign("https://agent-chat.mintlify.site/"); }} />
        </nav>
        <div className="mt-6 px-4 text-[12px] text-[#9ca3af]">Recent tasks</div>
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-2">
          {taskList.slice(0, 8).map((chat) => (
            <li key={chat.id} className="relative flex items-center">
              <button
                type="button"
                className={`min-w-0 flex-1 cursor-pointer truncate rounded-md px-2 py-1.5 text-left text-[13px] transition-colors duration-150 active:bg-[#e4e4e7] ${chat.id === chatId ? "bg-[#ececef]" : "hover:bg-[#ececef]"}`}
                onClick={() => {
                  openChat(chat.id);
                  closeSidebarOnNarrow();
                }}
              >
                {chat.title}
              </button>
              <button
                type="button"
                aria-label={`Task options for ${chat.title}`}
                className="cursor-pointer rounded-md px-2 py-1.5 text-[16px] leading-none text-[#6b7280] hover:bg-[#ececef]"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  if (menuChatId === chat.id) {
                    setMenuChatId(null);
                    setMenuAnchor(null);
                    return;
                  }
                  setMenuChatId(chat.id);
                  setMenuAnchor({ top: rect.bottom + 4, left: Math.max(8, rect.right - 220) });
                }}
              >
                ···
              </button>
              {menuChatId === chat.id && menuAnchor ? (
                <TaskMenu
                  top={menuAnchor.top}
                  left={menuAnchor.left}
                  pinned={chat.pinnedAt !== null}
                  onPin={() => pinChat.mutate({ id: chat.id, pinned: chat.pinnedAt === null })}
                  onRename={() => {
                    const next = window.prompt("Rename task", chat.title)?.trim();
                    if (next) renameChat.mutate({ id: chat.id, title: next.slice(0, 120) });
                  }}
                  onDuplicate={() => duplicateChat.mutate(chat.id)}
                  onDelete={() => {
                    if (window.confirm(`Delete ${chat.title}?`)) removeChat.mutate(chat.id);
                    setMenuChatId(null);
                    setMenuAnchor(null);
                  }}
                  onClose={() => {
                    setMenuChatId(null);
                    setMenuAnchor(null);
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
        <SidebarAccount creditsLabel={credits.data ? `${credits.data.credits}M` : "…"} onOpenSettings={setSettings} />
        <div className="flex items-center gap-2 px-3 pb-3">
          <UserButton />
          <span className="truncate text-[13px]">{displayName}</span>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end px-4 py-3">
          <div className="flex items-center gap-3 text-[13px] text-[#111]">
            {chatId ? (
              <button
                type="button"
                aria-label="All files in this task"
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[#ececec] text-[#111]"
                onClick={() => {
                  setFileFilter("all");
                  setPickedFiles([]);
                  setFilesOpen(true);
                }}
              >
                <FolderIcon />
              </button>
            ) : null}
            <CreditsMenu
              label={credits.data ? `${credits.data.credits}M` : "…"}
              onAddCredits={() => router.push("/usage")}
            />
          </div>
        </header>
        {banner ? (
          <p role="alert" className="mx-auto w-full max-w-[760px] px-6 text-[13px] text-amber-800">
            {banner}
          </p>
        ) : null}
        {view === "tasks" ? (
          <TasksView
            tasks={taskList}
            query={chatQuery}
            onQuery={setChatQuery}
            selecting={selectingTasks}
            onToggleSelect={() => setSelectingTasks((value) => !value)}
            onOpen={(id) => openChat(id)}
            onNew={() => openChat(null)}
            onPin={(id, pinned) => pinChat.mutate({ id, pinned })}
            onDelete={(id, title) => {
              if (window.confirm(`Delete ${title}?`)) removeChat.mutate(id);
            }}
          />
        ) : null}
        {filesOpen ? (
          <TaskFilesDialog
            files={taskFiles}
            filter={fileFilter}
            picked={pickedFiles}
            onFilter={setFileFilter}
            onPicked={setPickedFiles}
            onClose={() => setFilesOpen(false)}
          />
        ) : null}
        {view === "chat" ? (
          <>
            {ordered.length === 0 ? <EmptyState /> : (
              <MessageList
                messages={ordered}
                stream={stream}
                activeRunId={active?.runId}
                error={scopedRun?.error?.message}
                canRetry={scopedRun?.status === "failed" || scopedRun?.status === "cancelled"}
                retrying={retry.isPending}
                onRetry={() => retry.mutate()}
                working={running}
                liveMessageId={scopedRun?.assistantMessage?.id}
                liveTools={scopedRun?.tools}
                phase={status}
                progress={scopedRun?.progress}
              />
            )}
            {pendingWait ? (
              <div className="mx-auto w-full max-w-[760px] px-6 pb-3">
                <WaitpointCard
                  kind={pendingWait.kind}
                  request={pendingWait.request}
                  pending={respond.isPending}
                  onRespond={(response) => respond.mutate({ waitpointId: pendingWait.id, response })}
                />
              </div>
            ) : null}
            <form
              className="mx-auto w-full max-w-[762px] px-3 pb-6 min-[721px]:px-0"
              onSubmit={(event) => {
                event.preventDefault();
                submitDraft();
              }}
            >
              <div className="mx-auto w-full max-w-[762px] rounded-[24px] border border-[#ededed] bg-white px-4 pt-3 pb-2">
                <label htmlFor="composer" className="sr-only">
                  Assign a task or ask anything
                </label>
                {pending.length > 0 ? (
                  <ul className="mb-2 flex flex-wrap gap-2">
                    {pending.map((item) => (
                      <li key={item.localId} className="flex max-w-full items-center gap-2 rounded-lg border border-[#ececec] bg-white px-2 py-1 text-[12px]">
                        {item.previewUrl ? <img src={item.previewUrl} alt="" className="h-8 w-8 rounded object-cover" /> : null}
                        <span className="max-w-[140px] truncate">{item.name}</span>
                        {item.status === "uploading" ? <span>{item.progress}%</span> : null}
                        {item.status === "failed" ? <span className="text-red-700">{item.error ?? "Failed"}</span> : null}
                        {item.temporary ? <span className="text-[#6b7280]">Link may expire</span> : null}
                        {item.status === "failed" && item.file ? (
                          <button type="button" className="underline" onClick={() => void runUpload(item.localId, item.file as File)}>
                            Retry
                          </button>
                        ) : null}
                        {item.status === "uploading" ? (
                          <button type="button" className="underline" onClick={() => removePending(item.localId)}>
                            Cancel
                          </button>
                        ) : (
                          <button type="button" aria-label={`Remove ${item.name}`} onClick={() => removePending(item.localId)}>
                            ×
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <textarea
                  id="composer"
                  value={draft}
                  rows={2}
                  className="w-full resize-none bg-transparent text-[14px] text-[#1b1b1b] outline-none placeholder:text-[#585858]"
                  placeholder={ordered.length === 0 ? "Assign a task or ask anything..." : "Send a message..."}
                  onChange={(event) => setDraft(event.target.value)}
                  onPaste={(event) => {
                    const images = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
                    if (images.length === 0) return;
                    event.preventDefault();
                    addFiles(images);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey) {
                      event.preventDefault();
                      submitDraft();
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-between text-[#6b7280]">
                  <div className="relative flex gap-3">
                    <IconButton label="Attach files" onClick={() => setUploadOpen((open) => !open)}>
                      <PaperclipIcon />
                    </IconButton>
                    {uploadOpen ? (
                      <div className="absolute bottom-9 left-0 z-20 w-[min(280px,calc(100vw-2rem))] rounded-xl border border-[#ececec] bg-white p-3 shadow-lg">
                        <p className="mb-3 text-[13px] text-[#111]">Add a file from your device or select one from your library</p>
                        <Button
                          type="button"
                          variant="outline"
                          className="mb-2 w-full"
                          onClick={() => setLibraryOpen((open) => !open)}
                        >
                          Select Asset
                        </Button>
                        {libraryOpen ? (
                          <ul className="mb-2 max-h-40 overflow-y-auto text-[13px]">
                            {library.isLoading ? <li>Loading files…</li> : null}
                            {library.data?.assets.length === 0 ? <li>No saved files yet.</li> : null}
                            {library.data?.assets.map((asset) => (
                              <li key={asset.id}>
                                <button type="button" className="w-full truncate py-1 text-left hover:bg-[#f6f6f7]" onClick={() => addLibraryAsset(asset)}>
                                  {asset.originalName ?? asset.kind}
                                </button>
                              </li>
                            ))}
                            {library.error ? <li className="text-red-700">The media library could not be loaded.</li> : null}
                          </ul>
                        ) : null}
                        <Button
                          type="button"
                          className="w-full"
                          onClick={() => document.getElementById("upload-file")?.click()}
                        >
                          + Upload
                        </Button>
                        <input
                          id="upload-file"
                          type="file"
                          accept="image/*,video/*,audio/*"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            const files = [...(event.target.files ?? [])];
                            event.target.value = "";
                            if (files.length === 0) return;
                            addFiles(files);
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    {planMode ? (
                      <button type="button" className="text-[13px] text-[#111]" aria-pressed="true" onClick={() => setPlanMode(false)}>
                        Plan mode on
                      </button>
                    ) : null}
                    {running ? (
                      <button type="button" aria-label="Stop generation" className="grid h-8 w-8 place-items-center rounded-full bg-[#2a2a2a]" onClick={() => cancel.mutate()}>
                        <span className="block h-2.5 w-2.5 rounded-[2px] bg-[#e11d48]" />
                      </button>
                    ) : (
                      <button type="submit" aria-label="Send" className="grid h-8 w-8 place-items-center rounded-full text-[#111]" disabled={send.isPending || !draft.trim() || pending.some((item) => item.status === "uploading")}>
                        ↑
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {ordered.length === 0 ? (
                <div className="mt-4 flex gap-2 overflow-x-auto text-[13px] text-[#3f3f46]">
                  {chips.map((chip) => (
                    <button key={chip} type="button" className="shrink-0 rounded-full border border-[#ececec] bg-white px-3 py-1.5" onClick={() => setDraft(chip === "All" ? "" : chip)}>
                      {chip}
                    </button>
                  ))}
                </div>
              ) : null}
            </form>
          </>
        ) : null}
        {active?.token && active.triggerRunId ? (
          <LiveRun
            key={active.triggerRunId}
            runId={active.triggerRunId}
            domainRunId={active.runId}
            token={active.token}
            refreshToken={() => api.realtimeToken(active.runId).then((next) => next.token)}
            onConnection={onRealtime}
            onActivity={onRealtimeActivity}
            onDone={onRealtimeDone}
          />
        ) : null}
      </main>
      {settings ? (
        <SettingsDialog
          tab={settings}
          onTab={setSettings}
          onClose={() => setSettings(null)}
          name={displayName}
          email={user?.primaryEmailAddress?.emailAddress ?? ""}
          onOpenProfile={() => clerk.openUserProfile()}
          onSignOut={() => void clerk.signOut({ redirectUrl: "/sign-in" })}
          onDelete={async () => {
            if (!user) return;
            if (!window.confirm("Permanently delete this account?")) return;
            await user.delete();
            await clerk.signOut({ redirectUrl: "/sign-in" });
          }}
        />
      ) : null}
    </div>
  );
}

function EmptyState() {
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date());
  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <img src="/magica-favicon.svg" alt="" className="mb-3 h-10 w-10" />
      <p className="text-[13px] text-[#9ca3af]">{time}</p>
      <h1 className="mt-1 text-[24px] font-bold leading-8 text-[#1b1b1b]">Your AI worker</h1>
      <p className="mt-1 text-[14px] font-medium leading-6 text-[#585858]">Work at the speed of thought.</p>
    </div>
  );
}

function SideItem({ label, icon, active, detail, onClick }: { label: string; icon: ReactNode; active?: boolean; detail?: string; onClick: () => void }) {
  return (
    <button type="button" className={`flex h-[34px] w-full cursor-pointer items-center gap-3 rounded-[10px] px-2 text-left text-[14px] font-medium text-[#585858] transition-colors duration-150 active:bg-[#e7e7ea] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111] ${active ? "bg-[#f3f3f3]" : "hover:bg-[#ececef]"}`} onClick={onClick}>
      <span className="text-[#6b7280]">{icon}</span>
      <span className="flex-1">{label}</span>
      {detail ? <span className="text-[11px] text-[#9ca3af]">{detail}</span> : null}
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} className="grid h-7 w-7 cursor-pointer place-items-center rounded-md transition-colors duration-150 hover:bg-[#f3f3f4] active:bg-[#e7e7ea] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111]" onClick={onClick}>
      {children}
    </button>
  );
}

function TasksView({
  tasks,
  query,
  onQuery,
  selecting,
  onToggleSelect,
  onOpen,
  onNew,
  onPin,
  onDelete,
}: {
  tasks: Array<{ id: string; title: string; pinnedAt: string | null }>;
  query: string;
  onQuery: (value: string) => void;
  selecting: boolean;
  onToggleSelect: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string, title: string) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[920px] flex-1 px-4 py-6 min-[721px]:px-8 min-[721px]:py-8">
      <div className="mb-6 flex flex-col gap-3 min-[721px]:flex-row min-[721px]:items-center min-[721px]:justify-between">
        <h1 className="text-[28px] font-semibold">Tasks</h1>
        <div className="flex items-center gap-2 text-[13px]">
          <button type="button" className="rounded-full border border-[#ececec] px-3 py-1.5" onClick={onToggleSelect}>
            {selecting ? "Done" : "Select tasks"}
          </button>
          <button type="button" className="rounded-full bg-black px-3 py-1.5 text-white" onClick={onNew}>
            New task
          </button>
        </div>
      </div>
      <input
        className="mb-6 w-full rounded-xl border border-[#ececec] px-4 py-3 text-[14px] outline-none"
        placeholder="Search tasks..."
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        aria-label="Search tasks"
      />
      <ul>
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-3">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left text-[15px]" onClick={() => onOpen(task.id)}>
              {selecting ? <span className="h-4 w-4 rounded border border-[#d4d4d8]" /> : null}
              <span className="flex-1 truncate">{task.pinnedAt ? "★ " : ""}{task.title}</span>
            </button>
            <button type="button" className="text-[13px] text-[#6b7280]" aria-label={task.pinnedAt ? `Unpin ${task.title}` : `Pin ${task.title}`} onClick={() => onPin(task.id, task.pinnedAt === null)}>
              {task.pinnedAt ? "Unpin" : "Pin"}
            </button>
            <button type="button" className="text-[13px] text-[#6b7280]" aria-label={`Delete ${task.title}`} onClick={() => onDelete(task.id, task.title)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskMenu({
  top,
  left,
  pinned,
  onPin,
  onRename,
  onDuplicate,
  onDelete,
  onClose,
}: {
  top: number;
  left: number;
  pinned: boolean;
  onPin: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <button type="button" aria-label="Close task menu" className="fixed inset-0 z-20 cursor-default" onClick={onClose} />
      <div className="fixed z-30 w-[220px] rounded-xl border border-[#ececec] bg-white py-1 text-[14px] shadow-lg" style={{ top, left }}>
        <MenuRow label={pinned ? "Unpin" : "Pin to top"} icon={<PinIcon />} onClick={() => { onPin(); onClose(); }} />
        <MenuRow label="Rename" icon={<PencilIcon />} onClick={onRename} />
        <MenuRow label="Duplicate" icon={<CopyIcon />} onClick={onDuplicate} />
        <MenuRow label="Delete" icon={<TrashIcon />} danger onClick={onDelete} />
      </div>
    </>
  );
}

function MenuRow({ label, icon, danger, onClick }: { label: string; icon: ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-[#f6f6f7] ${danger ? "text-[#e11d48]" : "text-[#181818]"}`} onClick={onClick}>
      <span className={danger ? "text-[#e11d48]" : "text-[#6b7280]"}>{icon}</span>
      {label}
    </button>
  );
}

function TaskFilesDialog({
  files,
  filter,
  picked,
  onFilter,
  onPicked,
  onClose,
}: {
  files: TaskFile[];
  filter: TaskFileKind | "all";
  picked: string[];
  onFilter: (filter: TaskFileKind | "all") => void;
  onPicked: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { getToken } = useAuth();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const visible = filter === "all" ? files : files.filter((file) => file.kind === filter);
  const allSelected = visible.length > 0 && visible.every((file) => picked.includes(file.id));
  const filters: Array<[TaskFileKind | "all", string]> = [
    ["all", "All"],
    ["document", "Documents"],
    ["image", "Images"],
    ["video", "Videos"],
    ["audio", "Audio"],
    ["code", "Code files"],
  ];
  async function download(list: TaskFile[]) {
    setDownloadError(null);
    try {
      const token = await getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
      for (const file of list) {
        if (!file.url) continue;
        await downloadFile({ baseUrl, token, url: file.url, name: file.name });
      }
    } catch {
      setDownloadError("The file could not be downloaded.");
    }
  }
  function toggleAll() {
    if (allSelected) onPicked(picked.filter((id) => !visible.some((file) => file.id === id)));
    else onPicked([...new Set([...picked, ...visible.map((file) => file.id)])]);
  }
  function toggleOne(id: string) {
    onPicked(picked.includes(id) ? picked.filter((item) => item !== id) : [...picked, id]);
  }
  const groups = new Map<string, TaskFile[]>();
  for (const file of visible) {
    const day = file.day || "Earlier";
    groups.set(day, [...(groups.get(day) ?? []), file]);
  }
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-2 min-[721px]:p-6" role="dialog" aria-label="All files in this task" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-white p-4 shadow-xl min-[721px]:p-5" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-[16px] font-semibold">All files in this task</h2>
          <button type="button" className="ml-auto cursor-pointer text-[13px] text-[#6b7280]" onClick={toggleAll}>
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <button type="button" className="inline-flex cursor-pointer items-center gap-1 text-[13px] text-[#6b7280]" onClick={() => void download(visible)}>
            ↓ Download all
          </button>
          <button type="button" aria-label="Close" className="cursor-pointer px-2 text-[18px]" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {filters.map(([kind, label]) => {
            const count = kind === "all" ? files.length : files.filter((file) => file.kind === kind).length;
            const selected = filter === kind;
            return (
              <button
                key={kind}
                type="button"
                className={`cursor-pointer rounded-full px-3 py-1.5 text-[13px] ${selected ? "bg-[#3f3f46] text-white" : "bg-[#f3f3f4] text-[#3f3f46]"}`}
                onClick={() => onFilter(kind)}
              >
                {label}
                {count > 0 ? ` ${count}` : ""}
              </button>
            );
          })}
        </div>
        {downloadError ? <p role="alert" className="mb-2 text-[13px] text-amber-800">{downloadError}</p> : null}
        {picked.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-3 border-b border-[#f3f3f4] py-2">
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={`${picked.length} selected`} />
              {picked.length} selected
            </label>
            <button type="button" className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-full bg-black px-4 py-2 text-[13px] text-white" onClick={() => void download(visible.filter((file) => picked.includes(file.id)))}>
              ↓ Download {picked.length} {picked.length === 1 ? "file" : "files"}
            </button>
            <button type="button" className="cursor-pointer text-[13px] text-[#6b7280]" onClick={() => onPicked([])}>
              Cancel
            </button>
          </div>
        ) : null}
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? <li className="py-8 text-center text-[14px] text-[#6b7280]">No files in this chat yet.</li> : null}
          {[...groups.entries()].map(([day, items]) => (
            <li key={day}>
              <p className="px-1 py-2 text-[13px] text-[#6b7280]">{day}</p>
              <ul>
                {items.map((file) => {
                  const selected = picked.includes(file.id);
                  return (
                    <li key={file.id} className={`flex items-center gap-3 border-t border-[#f3f3f4] py-3 ${selected ? "bg-[#f6f6f7]" : ""}`}>
                      <input type="checkbox" checked={selected} aria-label={`Select ${file.name}`} onChange={() => toggleOne(file.id)} />
                      {file.kind === "image" && file.url ? <img src={file.url} alt="" className="h-10 w-10 rounded-md object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-md bg-[#f3f3f4] text-[11px] uppercase">{file.kind.slice(0, 3)}</span>}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[14px]">{file.name}</span>
                        <span className="block text-[12px] text-[#6b7280]">
                          {file.detail}
                          {file.when ? ` · ${file.when}` : ""}
                          {file.sizeLabel ? ` · ${file.sizeLabel}` : ""}
                        </span>
                      </div>
                      {file.url ? (
                        <button type="button" aria-label={`Download ${file.name}`} className="cursor-pointer px-2 text-[#6b7280]" onClick={() => void download([file])}>
                          ···
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type TaskFileKind = "image" | "video" | "audio" | "document" | "code";

type TaskFile = {
  id: string;
  name: string;
  kind: TaskFileKind;
  url: string | null;
  detail: string;
  when: string;
  day: string;
  sizeLabel: string | null;
};

function filesInChat(messages: Array<{ id: string; createdAt?: string; content: ContentBlock[]; attachments: AttachmentView[] }>): TaskFile[] {
  const files: TaskFile[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    for (const item of message.attachments ?? []) {
      const asset = item.asset as AttachmentView["asset"] & { id?: string; mime?: string; bytes?: string | null; createdAt?: string };
      const url = asset.url;
      const key = asset.id ?? url ?? `${message.id}-${item.position}`;
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(describeFile(key, asset.originalName ?? "Attachment", asset.kind, url, asset.mime, asset.bytes ?? null, asset.createdAt ?? message.createdAt));
    }
    for (const block of message.content) {
      if (block.type !== "asset") continue;
      const key = block.assetId ?? block.url;
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(describeFile(key, fileNameFromUrl(block.url), block.kind, block.url, null, null, message.createdAt));
    }
  }
  return files;
}

function describeFile(id: string, name: string, kind: string, url: string | null, mime: string | null | undefined, bytes: string | null, createdAt: string | undefined): TaskFile {
  const fileKind = fileKindFor(kind, name, mime);
  return {
    id,
    name,
    kind: fileKind,
    url,
    detail: mimeLabel(name, mime, fileKind),
    when: createdAt ? new Date(createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "",
    day: createdAt ? dayLabel(createdAt) : "Earlier",
    sizeLabel: formatBytes(bytes),
  };
}

function fileKindFor(kind: string, name: string, mime?: string | null): TaskFileKind {
  if (kind === "image" || kind === "video" || kind === "audio") return kind;
  const lower = `${name} ${mime ?? ""}`.toLowerCase();
  if (/\.(png|jpe?g|gif|webp)|image\//.test(lower)) return "image";
  if (/\.(mp4|mov|webm)|video\//.test(lower)) return "video";
  if (/\.(mp3|wav|m4a)|audio\//.test(lower)) return "audio";
  if (/\.(js|ts|tsx|py|json|html|css)|text\/(javascript|x-)/.test(lower)) return "code";
  return "document";
}

function mimeLabel(name: string, mime: string | null | undefined, kind: TaskFileKind): string {
  const ext = name.split(".").pop();
  if (ext && ext !== name && ext.length <= 5) return ext.toUpperCase();
  if (mime?.includes("png")) return "PNG";
  if (mime?.includes("jpeg")) return "JPEG";
  if (kind === "image") return "Image";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  if (kind === "code") return "Code";
  return "File";
}

function fileNameFromUrl(url: string): string {
  try {
    const name = new URL(url).pathname.split("/").pop();
    return name && name.length > 0 ? decodeURIComponent(name) : "Generated file";
  } catch {
    return "Generated file";
  }
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Earlier";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatBytes(value: string | null): string | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SettingsDialog({
  tab,
  onTab,
  onClose,
  name,
  email,
  onOpenProfile,
  onSignOut,
  onDelete,
}: {
  tab: string;
  onTab: (tab: string) => void;
  onClose: () => void;
  name: string;
  email: string;
  onOpenProfile: () => void;
  onSignOut: () => void;
  onDelete: () => Promise<void>;
}) {
  const { user } = useUser();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signOutOthers, setSignOutOthers] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const tabs = ["Account", "Preferences", "Shortcuts"];
  async function updatePassword() {
    if (!user) return;
    if (password.length < 8) {
      setPasswordError("Enter a new password with at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setPasswordError("The passwords do not match.");
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    try {
      await user.updatePassword({ newPassword: password, signOutOfOtherSessions: signOutOthers });
      setPasswordOpen(false);
      setPassword("");
      setConfirm("");
    } catch (error) {
      const clerkError = error as { errors?: Array<{ message?: string }> };
      setPasswordError(clerkError.errors?.[0]?.message ?? "The password could not be updated.");
    } finally {
      setSavingPassword(false);
    }
  }
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/30 p-2 min-[721px]:p-6" role="dialog" aria-label="Settings" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="grid max-h-[calc(100dvh-1rem)] w-full max-w-[860px] grid-cols-1 overflow-y-auto rounded-2xl bg-white min-[721px]:h-[560px] min-[721px]:grid-cols-[220px_1fr] min-[721px]:overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="border-r border-[#f0f0f0] p-3">
          <button type="button" className="mb-3 cursor-pointer px-2 text-[18px]" onClick={onClose} aria-label="Close">
            ×
          </button>
          {tabs.map((item) => (
            <button key={item} type="button" className={`block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-[14px] transition-colors duration-150 hover:bg-[#f6f6f7] ${tab === item.toLowerCase() ? "bg-[#f3f3f4]" : ""}`} onClick={() => onTab(item.toLowerCase())}>
              {item}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto p-8">
          {tab === "account" ? (
            <div>
              <h2 className="text-[22px] font-semibold">Account</h2>
              <p className="mt-6 text-[13px] text-[#6b7280]">Account Information</p>
              <div className="flex items-center justify-between border-b border-[#f3f3f4] py-4">
                <div>
                  <p className="text-[14px] font-medium">Profile and security</p>
                  <p className="text-[12px] text-[#6b7280]">Manage your profile, sign-in methods, and two-step verification</p>
                </div>
                <button type="button" className="cursor-pointer rounded-full border border-[#e6e6e6] px-4 py-2 text-[13px] transition-colors duration-150 hover:bg-[#f6f6f7]" onClick={onOpenProfile}>Open profile</button>
              </div>
              <div className="flex items-center justify-between border-b border-[#f3f3f4] py-4">
                <p className="text-[14px] font-medium">Email</p>
                <p className="text-[14px] text-[#6b7280]">{email || name}</p>
              </div>
              <div className="flex items-center justify-between border-b border-[#f3f3f4] py-4">
                <p className="text-[14px] font-medium">Subscription</p>
                <span className="rounded-full bg-[#e8f8ee] px-3 py-1 text-[13px] text-[#16803c]">Active</span>
              </div>
              <p className="mt-6 text-[13px] text-[#6b7280]">Account Actions</p>
              <div className="flex items-center justify-between border-b border-[#f3f3f4] py-4">
                <div>
                  <p className="text-[14px] font-medium">Password</p>
                  <p className="text-[12px] text-[#6b7280]">Change your account password</p>
                </div>
                <button type="button" className="cursor-pointer rounded-full border border-[#e6e6e6] px-4 py-2 text-[13px] transition-colors duration-150 hover:bg-[#f6f6f7]" onClick={() => { setPasswordError(null); setPasswordOpen(true); }}>Change</button>
              </div>
              <div className="flex items-center justify-between border-b border-[#f3f3f4] py-4">
                <div>
                  <p className="text-[14px] font-medium">Sign Out</p>
                  <p className="text-[12px] text-[#6b7280]">Sign out of your account</p>
                </div>
                <button type="button" className="cursor-pointer rounded-full border border-[#e6e6e6] px-4 py-2 text-[13px] transition-colors duration-150 hover:bg-[#f6f6f7]" onClick={onSignOut}>Sign Out</button>
              </div>
              <div className="flex items-center justify-between border-b border-[#f3f3f4] py-4">
                <div>
                  <p className="text-[14px] font-medium text-[#e11d48]">Permanently delete account</p>
                  <p className="text-[12px] text-[#6b7280]">Revoke access and stop eligible web billing</p>
                </div>
                <button type="button" className="cursor-pointer rounded-full bg-[#e11d48] px-4 py-2 text-[13px] text-white transition-colors duration-150 hover:bg-[#be123c]" onClick={() => void onDelete()}>Delete</button>
              </div>
            </div>
          ) : null}
          {tab === "preferences" ? (
            <div>
              <h2 className="text-[22px] font-semibold">Preferences</h2>
              <ThemePreference />
              <Row label="Language" value="Coming soon" />
            </div>
          ) : null}
          {tab === "shortcuts" ? (
            <div>
              <h2 className="text-[22px] font-semibold">Shortcuts</h2>
              <p className="mt-6 text-[13px] text-[#6b7280]">General</p>
              <Shortcut label="Open chat search" keys={["Ctrl", "K"]} />
              <Shortcut label="Start a new chat" keys={["Ctrl", "Shift", "O"]} />
              <Shortcut label="Toggle sidebar" keys={["Ctrl", "B"]} />
              <p className="mt-6 text-[13px] text-[#6b7280]">Chat</p>
              <Shortcut label="Toggle plan mode" keys={["Shift", "Tab"]} />
              <Shortcut label="Send message" keys={["Enter"]} />
              <Shortcut label="New line in composer" keys={["Shift", "Enter"]} />
              <Shortcut label="Force send" keys={["Ctrl", "Enter"]} />
              <Shortcut label="Cancel the current run" keys={["Esc"]} />
              <Shortcut label="Force-reset a stuck run" keys={["Ctrl", "Shift", "R"]} />
              <Shortcut label="Move focus between messages" keys={["↑", "↓"]} />
              <Shortcut label="Jump to first / last message" keys={["Home", "End"]} />
            </div>
          ) : null}
        </div>
      </div>
      {passwordOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-2 min-[721px]:p-6" role="dialog" aria-label="Change password" onClick={() => setPasswordOpen(false)}>
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-[440px] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">Change password</h2>
              <button type="button" aria-label="Close password dialog" className="cursor-pointer px-2 text-[18px]" onClick={() => setPasswordOpen(false)}>×</button>
            </div>
            <p className="text-[13px] text-[#6b7280]">Enter a new password with at least 8 characters.</p>
            <label className="mt-4 block text-[14px] font-medium">
              New password
              <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your new password" className="mt-1 w-full rounded-xl border border-[#e6e6e6] px-3 py-2 font-normal outline-none" />
            </label>
            <label className="mt-3 block text-[14px] font-medium">
              Confirm new password
              <input type={showPassword ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Confirm your new password" className="mt-1 w-full rounded-xl border border-[#e6e6e6] px-3 py-2 font-normal outline-none" />
            </label>
            <button type="button" className="mt-2 cursor-pointer text-[12px] text-[#6b7280]" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide passwords" : "Show passwords"}</button>
            <label className="mt-4 flex items-start gap-2 rounded-xl border border-[#ececec] p-3 text-[14px]">
              <input type="checkbox" checked={signOutOthers} onChange={(event) => setSignOutOthers(event.target.checked)} />
              <span>
                <span className="block font-medium">Sign out active sessions</span>
                <span className="block text-[12px] text-[#6b7280]">Enable this if you want sessions to sign in again after the password changes.</span>
              </span>
            </label>
            {passwordError ? <p role="alert" className="mt-3 text-[13px] text-[#e11d48]">{passwordError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="cursor-pointer rounded-full border border-[#e6e6e6] px-4 py-2 text-[14px]" onClick={() => setPasswordOpen(false)}>Cancel</button>
              <button type="button" className="cursor-pointer rounded-full bg-black px-4 py-2 text-[14px] text-white disabled:opacity-50" disabled={savingPassword} onClick={() => void updatePassword()}>{savingPassword ? "Updating…" : "Update password"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, detail, value }: { label: string; detail?: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#f3f3f4] py-4">
      <div>
        <p className="text-[14px]">{label}</p>
        {detail ? <p className="text-[12px] text-[#6b7280]">{detail}</p> : null}
      </div>
      <span className="text-[13px] text-[#6b7280]">{value}</span>
    </div>
  );
}

function Shortcut({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between border-b border-[#f3f3f4] py-3 text-[14px]">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((key, index) => (
          <span key={`${label}-${key}`} className="flex items-center gap-1">
            {index > 0 ? <span className="text-[#9ca3af]">+</span> : null}
            <kbd className="rounded-md border border-[#e6e6e6] bg-[#f6f6f7] px-2 py-1 text-[12px]">{key}</kbd>
          </span>
        ))}
      </span>
    </div>
  );
}

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-[#3f3f46] transition-colors duration-150 hover:bg-[#f3f3f4] active:bg-[#e7e7ea] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111]" onClick={onClick}>
      {children}
    </button>
  );
}

function GearIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  );
}
function PanelIcon() {
  return (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </Icon>
  );
}
function PlusIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </Icon>
  );
}
function TasksIcon() {
  return (
    <Icon>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 10h.01" />
      <path d="M12 10h.01" />
      <path d="M16 10h.01" />
    </Icon>
  );
}
function PinIcon() {
  return (
    <Icon>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </Icon>
  );
}
function PencilIcon() {
  return (
    <Icon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  );
}
function CopyIcon() {
  return (
    <Icon>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  );
}
function TrashIcon() {
  return (
    <Icon>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </Icon>
  );
}
function FolderIcon() {
  return (
    <Icon>
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </Icon>
  );
}
function LibraryIcon() {
  return (
    <Icon>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </Icon>
  );
}
function ApiIcon() {
  return (
    <Icon>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h6" />
      <path d="M8 11h8" />
    </Icon>
  );
}
function PaperclipIcon() {
  return (
    <Icon>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Icon>
  );
}

type LiveTool = {
  toolCallId: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  durationMs: number | null;
  chargedMicrocredits: string;
  schemaModelId?: string;
  schemaDurationMs?: number;
};

function MessageList({
  messages,
  stream,
  activeRunId,
  error,
  canRetry,
  retrying,
  onRetry,
  working,
  liveMessageId,
  liveTools,
  phase,
  progress,
}: {
  messages: Array<{
    id: string;
    role: string;
    status: string;
    runId: string | null;
    content: ContentBlock[];
    attachments: AttachmentView[];
  }>;
  stream?: { text: string; thinking: string };
  activeRunId?: string;
  error?: string;
  canRetry?: boolean;
  retrying?: boolean;
  onRetry?: () => void;
  working?: boolean;
  liveMessageId?: string;
  liveTools?: LiveTool[];
  phase?: "queued" | "thinking" | "working" | "waiting" | "stopping" | "completed" | "failed" | "cancelled";
  progress?: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  // TanStack Virtual returns functions the React Compiler cannot memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 8,
    getItemKey: (index) => messages[index]?.id ?? index,
  });
  const headId = messages[0]?.id ?? "";
  const contentMark = messages.map((message) => `${message.id}:${message.content.length}:${message.attachments.length}`).join("|");
  const tail = `${headId}:${messages.length}:${messages.at(-1)?.id ?? ""}:${stream?.text.length ?? 0}:${stream?.thinking.length ?? 0}:${error ?? ""}:${contentMark}`;
  const previousHead = useRef(headId);

  const totalSize = virtualizer.getTotalSize();
  useEffect(() => {
    if (previousHead.current !== headId) {
      previousHead.current = headId;
      stickToBottom.current = true;
    }
    const parent = parentRef.current;
    if (!parent || !stickToBottom.current) return;
    parent.scrollTop = parent.scrollHeight;
  }, [headId, tail, totalSize]);

  return (
    <div
      ref={parentRef}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-6"
      aria-live="polite"
      onScroll={(event) => {
        const parent = event.currentTarget;
        stickToBottom.current = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 80;
      }}
    >
      {messages.length === 0 ? (
        <p className="text-stone-500">Send a message to start. This is the Day 1 harness, not the finished Galaxy layout.</p>
      ) : (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const message = messages[item.index];
            if (!message) return null;
            return (
              <article
                key={item.key}
                data-index={item.index}
                data-message=""
                tabIndex={0}
                ref={virtualizer.measureElement}
                className={`absolute left-0 top-0 w-full pb-4 ${message.role === "user" ? "flex justify-end" : ""}`}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <div className={message.role === "user" ? (message.attachments.length > 0 ? "w-[min(440px,88%)] overflow-hidden rounded-2xl bg-[#ececee] px-3 py-2 text-[15px]" : "max-w-[75%] rounded-full bg-[#ececee] px-4 py-2 text-[15px]") : "w-full max-w-3xl"}>
                  {message.status === "failed" || message.status === "cancelled" ? (
                    <p className="mb-1 text-[12px] text-[#6b7280]">{message.status}</p>
                  ) : null}
                  <MessageBlocks
                    blocks={message.content}
                    attachments={message.attachments}
                    working={Boolean(working && message.role === "assistant" && (message.runId === activeRunId || message.id === liveMessageId))}
                    liveTools={message.role === "assistant" && (message.runId === activeRunId || message.id === liveMessageId) ? liveTools : undefined}
                    stream={message.role === "assistant" && (message.runId === activeRunId || message.id === liveMessageId) ? stream : undefined}
                    phase={message.role === "assistant" && (message.runId === activeRunId || message.id === liveMessageId) ? phase : undefined}
                    progress={message.role === "assistant" && (message.runId === activeRunId || message.id === liveMessageId) ? progress : undefined}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
      {error ? (
        <p role="alert" className="mx-auto mt-2 w-full max-w-3xl rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {canRetry ? (
        <button type="button" className="mt-2 text-sm underline" onClick={onRetry} disabled={retrying}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

function LiveRun({
  runId,
  domainRunId,
  token,
  refreshToken,
  onConnection,
  onActivity,
  onDone,
}: {
  runId: string;
  domainRunId: string;
  token: string;
  refreshToken: () => Promise<string | null>;
  onConnection: (next: "open" | "down") => void;
  onActivity: (updatedAt: string) => void;
  onDone: () => void;
}) {
  const setStream = useRunStore((state) => state.setStream);
  const [accessToken, setAccessToken] = useState(token);
  const [attempt, setAttempt] = useState(0);
  const refresh = useRef(refreshToken);
  const notify = useRef({ onConnection, onActivity, onDone });
  const finished = useRef(false);
  useEffect(() => {
    refresh.current = refreshToken;
    notify.current = { onConnection, onActivity, onDone };
  }, [onActivity, onConnection, onDone, refreshToken]);
  useEffect(() => {
    setAccessToken(token);
  }, [token]);
  const { run, streams, error } = useRealtimeRunWithStreams(runId, {
    accessToken,
    baseURL: "https://api.trigger.dev",
    throttleInMs: 50,
  });
  useEffect(() => {
    if (run) notify.current.onConnection("open");
  }, [run]);
  useEffect(() => {
    if (!run) return;
    const stamp = metadataStamp(run.metadata);
    if (stamp) notify.current.onActivity(stamp);
    if (run.finishedAt && !finished.current) {
      finished.current = true;
      notify.current.onDone();
    }
  }, [run]);
  useEffect(() => {
    if (run) return;
    const timer = setTimeout(() => notify.current.onConnection("down"), 8_000);
    return () => clearTimeout(timer);
  }, [run]);
  useEffect(() => {
    if (!error || attempt >= 4) return;
    notify.current.onConnection("down");
    const timer = setTimeout(() => {
      void refresh.current()
        .then((next) => {
          if (next) setAccessToken(next);
        })
        .finally(() => setAttempt((value) => value + 1));
    }, Math.min(8_000, 500 * 2 ** attempt));
    return () => clearTimeout(timer);
  }, [attempt, error]);
  useEffect(() => {
    const parts = streamParts(streams);
    if (!parts) return;
    let text = "";
    let thinking = "";
    for (const part of parts) {
      if (part.kind === "thinking") thinking += part.delta;
      if (part.kind === "text") text += part.delta;
    }
    setStream(domainRunId, { text, thinking });
  }, [domainRunId, setStream, streams]);
  return error && attempt >= 4 ? <p className="sr-only">Live updates paused. The saved run will refresh from the server.</p> : null;
}

function metadataStamp(metadata: unknown): string | null {
  const record = asRecord(metadata);
  const body = asRecord(record?.run);
  return typeof body?.updatedAt === "string" ? body.updatedAt : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function streamParts(streams: unknown): Array<{ kind: string; delta: string }> | null {
  const record = asRecord(streams);
  const parts = record?.["agent-output"];
  if (!Array.isArray(parts)) return null;
  const parsed: Array<{ kind: string; delta: string }> = [];
  for (const part of parts) {
    const chunk = asRecord(part);
    const nested = asRecord(chunk?.chunk) ?? chunk;
    if (nested && typeof nested.kind === "string" && typeof nested.delta === "string") {
      parsed.push({ kind: nested.kind, delta: nested.delta });
    }
  }
  return parsed;
}
