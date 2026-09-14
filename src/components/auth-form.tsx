"use client";

import { KeyRound, Loader2, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AuthForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace("/");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    }
  };

  const resetPassword = async () => {
    if (!email) { setStatus("error"); setMessage("Enter your email address first."); return; }
    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/update-password` });
      if (error) throw error;
      setStatus("sent");
      setMessage("Check your email to create or reset your password. The link expires for security.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The password email could not be sent.");
    }
  };

  return (
    <form onSubmit={signIn} className="mt-8 space-y-4">
      <label className="block text-sm font-semibold">Email address
        <span className="relative mt-2 block"><Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-[var(--muted)]" /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-xl border border-[var(--line)] bg-white pl-10 pr-3 font-normal" placeholder="you@example.com" /></span>
      </label>
      <label className="block text-sm font-semibold">Password
        <span className="relative mt-2 block"><LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-[var(--muted)]" /><input type="password" required minLength={12} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-xl border border-[var(--line)] bg-white pl-10 pr-3 font-normal" /></span>
      </label>
      <button disabled={status === "loading"} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest)] px-4 text-sm font-semibold text-white disabled:opacity-50">{status === "loading" ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <KeyRound aria-hidden="true" className="size-4" />} Sign in securely</button>
      <button type="button" disabled={status === "loading"} onClick={() => void resetPassword()} className="h-10 w-full text-sm font-semibold text-[var(--forest)] underline underline-offset-4">Create or reset password</button>
      {message ? <p role={status === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${status === "error" ? "bg-[#f7e3df] text-[var(--danger)]" : "bg-[var(--forest-soft)] text-[var(--forest)]"}`}>{message}</p> : null}
    </form>
  );
}
