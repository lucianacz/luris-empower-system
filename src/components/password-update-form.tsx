"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function PasswordUpdateForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) return setMessage("The passwords do not match.");
    if (!strongPassword(password)) return setMessage("Use at least 12 characters with uppercase, lowercase, a number, and a symbol.");
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setMessage(error.message);
    router.replace("/");
    router.refresh();
  };
  return <form onSubmit={submit} className="mt-7 space-y-4"><label className="block text-sm font-semibold">New password<input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="field" /></label><label className="block text-sm font-semibold">Confirm password<input type="password" required minLength={12} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="field" /></label><button disabled={loading} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest)] px-4 text-sm font-semibold text-white disabled:opacity-50">{loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <ShieldCheck aria-hidden="true" className="size-4" />}Save private password</button>{message ? <p role="alert" className="rounded-xl bg-[#f7e3df] p-3 text-sm text-[var(--danger)]">{message}</p> : null}</form>;
}

function strongPassword(value: string) { return value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value); }
