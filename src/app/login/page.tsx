import Link from "next/link";
import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/");

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <section className="w-full max-w-md rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[0_24px_70px_rgba(37,45,42,0.09)] sm:p-9">
        <Link href="/" className="inline-flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[14px] bg-[var(--forest)] text-white"><Sparkles aria-hidden="true" className="size-5" /></span><span className="text-lg font-semibold">Empower</span></Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--amber)]">Private workspace</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Sign in to your private project</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Email and password are required. Supabase Auth manages the session, and database policies isolate every financial row.</p>
        <AuthForm />
      </section>
    </main>
  );
}
