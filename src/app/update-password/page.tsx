import { redirect } from "next/navigation";
import { PasswordUpdateForm } from "@/components/password-update-form";
import { createClient } from "@/lib/supabase/server";

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <main className="grid min-h-screen place-items-center px-4 py-12"><section className="w-full max-w-md rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[0_24px_70px_rgba(37,45,42,0.09)] sm:p-9"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--forest)]">Private workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Create a secure password</h1><p className="mt-2 text-sm leading-6 text-[var(--muted)]">This password protects access to your financial workspace. Use a unique password you do not use elsewhere.</p><PasswordUpdateForm /></section></main>;
}
