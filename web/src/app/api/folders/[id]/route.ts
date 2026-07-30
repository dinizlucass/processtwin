import { supabaseAdmin } from "@/lib/supabase/server";

interface PatchBody {
  name?: string;
  parentId?: string | null;
  color?: string | null;
}

type Ctx = { params: Promise<{ id: string }> };

// evita mover uma pasta para dentro dela mesma ou de uma descendente (ciclo)
async function wouldCycle(
  supabase: ReturnType<typeof supabaseAdmin>,
  folderId: string,
  newParentId: string,
): Promise<boolean> {
  if (folderId === newParentId) return true;
  const { data } = await supabase.from("process_folder").select("id,parent_id");
  const parentOf = new Map<string, string | null>(
    ((data ?? []) as { id: string; parent_id: string | null }[]).map((r) => [r.id, r.parent_id]),
  );
  let cur: string | null = newParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === folderId) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as PatchBody;
  const supabase = supabaseAdmin();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") {
    const clean = body.name.trim();
    if (!clean) return Response.json({ error: "Nome inválido." }, { status: 400 });
    patch.name = clean;
  }
  if (body.parentId !== undefined) {
    if (body.parentId && (await wouldCycle(supabase, id, body.parentId))) {
      return Response.json({ error: "Não é possível mover uma pasta para dentro dela mesma." }, { status: 400 });
    }
    patch.parent_id = body.parentId ?? null;
  }
  if (body.color !== undefined) patch.color = body.color;

  const { error } = await supabase.from("process_folder").update(patch).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  // pasta-pai da que será excluída — os filhos sobem para lá (reparent não-destrutivo)
  const { data: folder, error: fErr } = await supabase
    .from("process_folder")
    .select("parent_id")
    .eq("id", id)
    .single();
  if (fErr) return Response.json({ error: fErr.message }, { status: 500 });
  const parentId = (folder?.parent_id as string | null) ?? null;

  // sobe subpastas e processos para a pasta-pai
  const { error: subErr } = await supabase.from("process_folder").update({ parent_id: parentId }).eq("parent_id", id);
  if (subErr) return Response.json({ error: subErr.message }, { status: 500 });
  const { error: procErr } = await supabase.from("process").update({ folder_id: parentId }).eq("folder_id", id);
  if (procErr) return Response.json({ error: procErr.message }, { status: 500 });

  const { error: delErr } = await supabase.from("process_folder").delete().eq("id", id);
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  return Response.json({ ok: true, reparentedTo: parentId });
}
