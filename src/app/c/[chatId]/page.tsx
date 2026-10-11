import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ErrorBoundary } from "@/components/error-boundary";
import { ChatWorkspace } from "@/components/chat-workspace";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const session = await auth();
  if (!session.userId) redirect("/sign-in");
  const { chatId } = await params;
  return (
    <ErrorBoundary>
      <ChatWorkspace key={chatId} chatId={chatId} />
    </ErrorBoundary>
  );
}
