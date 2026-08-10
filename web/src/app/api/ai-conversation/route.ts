import { supabaseAdmin } from "@/lib/supabase/server";
import { getConversation, listResumableConversations } from "@/lib/queries/conversations";

/** GET ?id=<id>  → dados para retomar a entrevista de uma conversa.
 *  GET ?recent=1 → conversas recentes que dá para continuar (para o "continuar de onde parou"). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const c = await getConversation(id);
    if (!c) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
    return Response.json({
      id: c.id,
      title: c.title,
      messages: c.messages,
      extractedFields: c.extractedFields,
      status: c.status,
      processId: c.processId,
      processName: c.processName,
    });
  }

  const recent = await listResumableConversations(6);
  return Response.json({
    conversations: recent.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      userMessageCount: c.userMessageCount,
      updatedAt: c.updatedAt,
      processId: c.processId,
    })),
  });
}

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
