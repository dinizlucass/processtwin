import { supabaseAdmin } from "@/lib/supabase/server";

interface PatchBody {
  folderId?: string | null;
}

type Ctx = { params: Promise<{ id: string }> };

/** Move um processo para uma pasta (folderId = null tira da pasta). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as PatchBody;
  const supabase = supabaseAdmin();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.folderId !== undefined) patch.folder_id = body.folderId ?? null;

  const { error } = await supabase.from("process").update(patch).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
