import { supabaseAdmin } from "@/lib/supabase/server";

const MISSING = /does not exist|could not find|schema cache/i;

interface PostBody {
  fromProcess: string;
  toProcess: string;
  label?: string | null;
}

/** Confirma um hand-off inferido (ou cria um manual) processo→processo. */
export async function POST(req: Request) {
  let body: PostBody;
  try { body = await req.json(); } catch { return Response.json({ error: "JSON inválido." }, { status: 400 }); }
  const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  if (!body || !uuid(body.fromProcess) || !uuid(body.toProcess) || body.fromProcess === body.toProcess || (body.label != null && (typeof body.label !== "string" || body.label.length > 240))) {
    return Response.json({ error: "Origem e destino inválidos." }, { status: 400 });
  }
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("process_relationship")
    .upsert(
      { from_process: body.fromProcess, to_process: body.toProcess, kind: "handoff", label: body.label ?? null },
      { onConflict: "from_process,to_process,kind" },
    )
    .select("id")
    .single();

  if (error) {
    if (MISSING.test(error.message)) {
      return Response.json(
        { error: "Rode a migração 004_process_relationships.sql no Supabase para salvar hand-offs." },
        { status: 409 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ id: data.id });
}

/** Remove um hand-off confirmado. */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const id = searchParams.get("id");
  if (!id && !(from && to)) return Response.json({ error: "Informe id ou (from,to)." }, { status: 400 });
  const supabase = supabaseAdmin();

  const q = supabase.from("process_relationship").delete();
  const { error } = id
    ? await q.eq("id", id)
    : from && to
      ? await q.eq("from_process", from).eq("to_process", to).eq("kind", "handoff")
      : { error: { message: "Informe id ou (from,to)." } as { message: string } };

  if (error) {
    if (MISSING.test(error.message)) return Response.json({ ok: true }); // nada a remover
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
