import { supabaseAdmin } from "@/lib/supabase/server";
import { getConversation, listResumableConversations } from "@/lib/queries/conversations";
import type { ExtractedFacts } from "@/lib/phases";

/** GET ?id=<id>  → dados para retomar a entrevista de uma conversa.
 *  GET ?recent=1 → conversas recentes que dá para continuar (para o "continuar de onde parou"). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    let c;
    try {
      c = await getConversation(id);
    } catch {
      return Response.json({ error: "Não foi possível consultar a conversa. Tente novamente." }, { status: 503 });
    }
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
  extractedFields: ExtractedFacts;
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
    ...(body.processId !== undefined ? { process_id: body.processId } : {}),
    updated_at: new Date().toISOString(),
  };

  if (body.id) {
    // A delayed autosave must never reopen or detach a committed conversation.
    const { data, error } = await supabase.from("ai_conversation").update(payload).eq("id", body.id).is("process_id", null).select("id");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data?.length) return Response.json({ error: "Conversa já concluída ou não encontrada." }, { status: 409 });
    return Response.json({ id: body.id });
  }

  const { data, error } = await supabase.from("ai_conversation").insert(payload).select("id").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ id: data.id as string });
}
