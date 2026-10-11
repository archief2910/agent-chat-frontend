import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ErrorBoundary } from "@/components/error-boundary";
import { ChatWorkspace } from "@/components/chat-workspace";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await auth();
  if (!session.userId) redirect("/sign-in");
  return (
    <ErrorBoundary>
      <ChatWorkspace key="tasks" chatId={null} view="tasks" />
    </ErrorBoundary>
  );
}
