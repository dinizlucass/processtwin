import { supabaseAdmin } from "@/lib/supabase/server";
import { prepareMappingCommit } from "@/lib/mapping-commit";

export async function POST(req: Request) {
  let prepared;
  try { prepared = prepareMappingCommit(await req.json()); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Pré-mapeamento inválido." }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin().rpc("commit_process_mapping", {
    p_request_id: prepared.requestId, p_payload: prepared.payload,
  });
  if (error) {
    const missing = error.code === "PGRST202";
    const conflict = /IDEMPOTENCY_CONFLICT|CONVERSATION_ALREADY_COMMITTED/.test(error.message);
    const notFound = error.message.includes("CONVERSATION_NOT_FOUND");
    return Response.json({ error: missing
      ? "Aplique a migração 006_atomic_mapping_commit.sql para concluir o mapeamento com segurança."
      : conflict ? "Esta tentativa ou conversa já foi concluída com outro conteúdo. Abra o processo salvo antes de continuar."
      : notFound ? "A conversa não foi encontrada. Retome uma conversa válida."
      : "Não foi possível concluir o mapeamento. Nenhuma alteração desta tentativa foi gravada.",
      code: missing ? "MIGRATION_REQUIRED" : conflict ? "COMMIT_CONFLICT" : notFound ? "CONVERSATION_NOT_FOUND" : "COMMIT_FAILED",
    }, { status: missing ? 503 : conflict ? 409 : notFound ? 404 : 500 });
  }
  return Response.json(data);
}
