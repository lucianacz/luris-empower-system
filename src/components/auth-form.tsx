"use client";

import { Loader2, Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AuthForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setStatus("sent");
      setMessage("Check your email for a secure sign-in link.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Sign-in could not be started.");
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <label className="block text-sm font-semibold">Email address
        <span className="relative mt-2 block"><Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-[var(--muted)]" /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-xl border border-[var(--line)] bg-white pl-10 pr-3 font-normal" placeholder="you@example.com" /></span>
      </label>
      <button disabled={status === "loading"} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest)] px-4 text-sm font-semibold text-white disabled:opacity-50">{status === "loading" ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null} Email me a sign-in link</button>
      {message ? <p role={status === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${status === "error" ? "bg-[#f7e3df] text-[var(--danger)]" : "bg-[var(--forest-soft)] text-[var(--forest)]"}`}>{message}</p> : null}
    </form>
  );
}
