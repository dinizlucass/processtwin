import { supabaseAdmin } from "@/lib/supabase/server";

interface Body {
  name?: string;
  parentId?: string | null;
}

export async function POST(req: Request) {
  const { name, parentId } = (await req.json()) as Body;
  const clean = (name ?? "").trim();
  if (!clean) return Response.json({ error: "Nome da pasta é obrigatório." }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("process_folder")
    .insert({ name: clean, parent_id: parentId ?? null })
    .select("id,name,parent_id,color,position")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    folder: { id: data.id, name: data.name, parentId: data.parent_id, color: data.color, position: data.position },
  });
}
