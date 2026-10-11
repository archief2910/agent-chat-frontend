import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-white p-6 text-center">
      <div>
        <h1 className="text-[28px] font-semibold">Page not found</h1>
        <p className="mt-2 text-[14px] text-[#6b7280]">That address does not match a screen in this app.</p>
        <Link href="/" className="mt-4 inline-flex cursor-pointer rounded-full bg-black px-4 py-2 text-[14px] text-white">
          Back to chat
        </Link>
      </div>
    </main>
  );
}
