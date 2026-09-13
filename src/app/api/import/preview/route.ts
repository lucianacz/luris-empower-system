import { previewFile } from "@/lib/import/engine";
import { stableFingerprint } from "@/lib/import/normalize";
import { providers, type ColumnMapping, type Provider } from "@/lib/import/types";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const maxBytes = 15 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a statement file to preview." }, { status: 400 });
    if (file.size > maxBytes) return Response.json({ error: "Files must be 15 MB or smaller." }, { status: 413 });

    const providerValue = form.get("provider");
    const provider = typeof providerValue === "string" && providers.includes(providerValue as Provider) ? providerValue as Provider : undefined;
    const mappingValue = form.get("mapping");
    const mapping = typeof mappingValue === "string" && mappingValue ? JSON.parse(mappingValue) as ColumnMapping : undefined;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let preview = await previewFile({ name: file.name, mimeType: file.type, bytes }, { provider, mapping });
    if (preview.requiresMapping && !mapping && hasSupabaseEnv() && preview.headers.length) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const signature = stableFingerprint(preview.headers);
        const institution = preview.detection.provider === "generic" ? "other" : preview.detection.provider;
        const { data: saved } = await supabase.from("import_mappings").select("mapping").eq("user_id", user.id).eq("institution", institution).eq("signature", signature).maybeSingle();
        if (saved?.mapping) preview = await previewFile({ name: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }, { provider, mapping: saved.mapping as ColumnMapping });
      }
    }
    return Response.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The statement could not be read.";
    return Response.json({ error: message }, { status: 422 });
  }
}
