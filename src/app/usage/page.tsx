import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ErrorBoundary } from "@/components/error-boundary";
import { UsageScreen } from "@/components/usage-screen";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const session = await auth();
  if (!session.userId) redirect("/sign-in");
  return (
    <ErrorBoundary>
      <UsageScreen />
    </ErrorBoundary>
  );
}
