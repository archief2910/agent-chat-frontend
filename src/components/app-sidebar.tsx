"use client";

import { useAuth, useClerk, useUser, UserButton } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SettingsDialog } from "@/components/chat-workspace";
import { SidebarAccount } from "@/components/sidebar-account";
import { ApiError, createApi } from "@/lib/api";

export function AppSidebar({ active, chatId = null }: { active: "tasks" | "library" | "usage" | "chat"; chatId?: string | null }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const api = useMemo(
    () => createApi({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001", getToken }),
    [getToken],
  );
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(max-width: 720px)").matches) setOpen(false);
  }, []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const chats = useQuery({ queryKey: ["chats", query], queryFn: () => api.listChats(query) });
  const credits = useQuery({ queryKey: ["credits"], queryFn: () => api.credits() });
  const tasks = [...(chats.data?.pinned ?? []), ...(chats.data?.chats ?? [])];
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Account";

  const renameChat = useMutation({
    mutationFn: (input: { id: string; title: string }) => api.updateChat(input.id, { title: input.title }),
    onSuccess: async () => {
      setMenuId(null);
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
  const pinChat = useMutation({
    mutationFn: (input: { id: string; pinned: boolean }) => api.updateChat(input.id, { pinned: input.pinned }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
  const duplicateChat = useMutation({
    mutationFn: (id: string) => api.duplicateChat(id),
    onSuccess: async (chat) => {
      setMenuId(null);
      router.push(`/c/${chat.id}`);
    },
  });
  const removeChat = useMutation({
    mutationFn: (id: string) => api.deleteChat(id),
    onSuccess: async () => {
      setMenuId(null);
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
      if (chatId) router.push("/");
    },
  });

  return (
    <>
      {open ? (
        <button type="button" aria-label="Close sidebar" className="fixed inset-0 z-30 bg-black/40 min-[721px]:hidden" onClick={() => setOpen(false)} />
      ) : null}
      {open ? null : (
        <nav aria-label="Collapsed menu" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[#ececec] bg-white py-3">
          <Rail label="Open sidebar" onClick={() => setOpen(true)}><PanelIcon /></Rail>
          <Rail label="New task" onClick={() => router.push("/")}><PlusIcon /></Rail>
          <Rail label="Tasks" onClick={() => router.push("/tasks")}><TasksIcon /></Rail>
          <Rail label="Library" onClick={() => router.push("/library")}><LibraryIcon /></Rail>
        </nav>
      )}
      <aside className={`${open ? "fixed inset-y-0 left-0 z-40 flex min-[721px]:static" : "hidden"} w-[232px] shrink-0 flex-col border-r border-[#ececec] bg-white`}>
        <div className="flex items-center justify-between px-4 py-4">
          <button type="button" className="cursor-pointer" onClick={() => router.push("/")}>
            <img src="/magica-wordmark.png" alt="Magica" className="h-5 w-auto" />
          </button>
          <span className="flex gap-2 text-[#6b7280]">
            <Rail label="Search" onClick={() => setSearchOpen((value) => !value)}><SearchIcon /></Rail>
            <Rail label="Toggle sidebar" onClick={() => setOpen(false)}><PanelIcon /></Rail>
          </span>
        </div>
        {searchOpen ? (
          <label className="block px-3 pb-2">
            <span className="sr-only">Search tasks</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-md border border-[#ececec] bg-white px-2 py-1.5 text-[13px] outline-none" placeholder="Search tasks" />
          </label>
        ) : null}
        <nav className="px-2 text-[14px] text-[#3f3f46]">
          <Side label="New task" icon={<PlusIcon />} onClick={() => router.push("/")} />
          <Side label="Tasks" icon={<TasksIcon />} active={active === "tasks"} onClick={() => router.push("/tasks")} />
          <Side label="Library" icon={<LibraryIcon />} active={active === "library"} onClick={() => router.push("/library")} />
          <Side label="API / MCP" icon={<ApiIcon />} onClick={() => setNotice("API / MCP is not connected yet.")} />
        </nav>
        {notice ? <p className="px-4 pt-2 text-[12px] text-[#6b7280]">{notice}</p> : null}
        <div className="mt-6 px-4 text-[12px] text-[#9ca3af]">Recent tasks</div>
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-2">
          {tasks.slice(0, 8).map((chat) => (
            <li key={chat.id} className="relative">
              <div className="flex items-center">
                <button type="button" className={`min-w-0 flex-1 cursor-pointer truncate rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[#ececef] ${chat.id === chatId ? "bg-[#ececef]" : ""}`} onClick={() => router.push(`/c/${chat.id}`)}>
                  {chat.title}
                </button>
                <button type="button" aria-label={`Task options for ${chat.title}`} className="cursor-pointer rounded-md px-2 py-1.5 text-[16px] text-[#6b7280]" onClick={() => setMenuId(menuId === chat.id ? null : chat.id)}>
                  ···
                </button>
              </div>
              {menuId === chat.id ? (
                <div className="absolute right-2 z-30 w-[180px] rounded-xl border border-[#ececec] bg-white py-1 text-[13px] shadow-lg">
                  <Menu label={chat.pinnedAt ? "Unpin" : "Pin to top"} onClick={() => pinChat.mutate({ id: chat.id, pinned: !chat.pinnedAt })} />
                  <Menu label="Rename" onClick={() => {
                    const next = window.prompt("Rename task", chat.title)?.trim();
                    if (next) renameChat.mutate({ id: chat.id, title: next.slice(0, 120) });
                  }} />
                  <Menu label="Duplicate" onClick={() => duplicateChat.mutate(chat.id)} />
                  <Menu label="Delete" onClick={() => {
                    if (window.confirm(`Delete ${chat.title}?`)) removeChat.mutate(chat.id);
                  }} />
                  {removeChat.error || renameChat.error || duplicateChat.error ? <p className="px-3 py-1 text-[12px] text-amber-800">{errorText(removeChat.error ?? renameChat.error ?? duplicateChat.error)}</p> : null}
                </div>
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
    </>
  );
}

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "The task could not be updated.";
}

function Side({ label, icon, active, onClick }: { label: string; icon: ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`flex h-[34px] w-full cursor-pointer items-center gap-3 rounded-[10px] px-2 text-left text-[14px] font-medium text-[#585858] ${active ? "bg-[#f3f3f3]" : "hover:bg-[#ececef]"}`} onClick={onClick}>
      <span className="text-[#6b7280]">{icon}</span>
      {label}
    </button>
  );
}

function Menu({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="block w-full cursor-pointer px-3 py-2 text-left hover:bg-[#f6f6f7]" onClick={onClick}>
      {label}
    </button>
  );
}

function Rail({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} className="grid h-8 w-8 cursor-pointer place-items-center rounded-md text-[#3f3f46] hover:bg-[#f3f3f4]" onClick={onClick}>
      {children}
    </button>
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
  return <Icon><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Icon>;
}
function PanelIcon() {
  return <Icon><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></Icon>;
}
function PlusIcon() {
  return <Icon><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" /></Icon>;
}
function TasksIcon() {
  return <Icon><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Icon>;
}
function LibraryIcon() {
  return <Icon><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Icon>;
}
function ApiIcon() {
  return <Icon><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M8 7h6" /><path d="M8 11h8" /></Icon>;
}
