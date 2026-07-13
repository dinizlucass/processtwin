import { supabaseAdmin } from "@/lib/supabase/server";

interface Body {
  id?: string;
  messages: { role: string; text: string }[];
  extractedFields: Record<string, string>;
  status?: string;
  processId?: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const supabase = supabaseAdmin();

  const payload = {
    messages: body.messages ?? [],
    extracted_fields: body.extractedFields ?? {},
    status: body.status ?? "em_andamento",
    process_id: body.processId ?? null,
    updated_at: new Date().toISOString(),
  };

  if (body.id) {
    const { error } = await supabase.from("ai_conversation").update(payload).eq("id", body.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ id: body.id });
  }

  const { data, error } = await supabase.from("ai_conversation").insert(payload).select("id").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ id: data.id as string });
}
