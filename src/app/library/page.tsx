import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ErrorBoundary } from "@/components/error-boundary";
import { LibraryScreen } from "@/components/library-screen";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const session = await auth();
  if (!session.userId) redirect("/sign-in");
  return (
    <ErrorBoundary>
      <LibraryScreen />
    </ErrorBoundary>
  );
}
