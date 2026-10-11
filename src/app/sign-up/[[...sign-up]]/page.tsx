import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-50">
      <SignUp />
    </main>
  );
}
