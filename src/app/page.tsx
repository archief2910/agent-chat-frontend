import { SignIn, SignUp } from "@clerk/nextjs";

export const dynamic = "force-dynamic";
import { auth } from "@clerk/nextjs/server";
import { ErrorBoundary } from "@/components/error-boundary";
import { ChatWorkspace } from "@/components/chat-workspace";

export default async function HomePage() {
  const session = await auth();
  if (!session.userId) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-50 p-6">
        <div className="grid gap-8 md:grid-cols-2">
          <SignIn routing="hash" />
          <SignUp routing="hash" />
        </div>
      </main>
    );
  }
  return (
    <ErrorBoundary>
      <ChatWorkspace key="new" chatId={null} />
    </ErrorBoundary>
  );
}
