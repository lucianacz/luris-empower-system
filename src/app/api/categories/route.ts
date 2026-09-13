import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["income", "expense", "transfer", "investment"]).default("expense"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const session = await sessionClient();
  if (session instanceof Response) return session;
  const { data, error } = await session.supabase.from("categories").select("id,name,kind,color,icon,parent_id").eq("user_id", session.userId).eq("is_archived", false).order("name");
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ categories: data ?? [] });
}

export async function POST(request: Request) {
  const session = await sessionClient();
  if (session instanceof Response) return session;
  const result = categorySchema.safeParse(await request.json());
  if (!result.success) return Response.json({ error: result.error.issues[0]?.message }, { status: 400 });
  const { data, error } = await session.supabase.from("categories").insert({ user_id: session.userId, name: result.data.name, kind: result.data.kind, color: result.data.color ?? null, icon: result.data.icon ?? null, parent_id: result.data.parentId ?? null }).select("id,name,kind,color,icon,parent_id").single();
  if (error) return Response.json({ error: error.message }, { status: 422 });
  return Response.json({ category: data }, { status: 201 });
}

async function sessionClient() {
  if (!hasSupabaseEnv()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  return { supabase, userId: user.id };
}
