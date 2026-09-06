import { supabaseAdmin } from "@/lib/supabase/server";
import { isUuid, parseFlow, flowRows } from "@/lib/flow-persistence";

export async function POST(req: Request) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "JSON inválido." }, { status: 400 }); }
  const { processId, expectedVersion } = body ?? {};
  if (!isUuid(processId) || (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 1))) {
    return Response.json({ error: "Processo ou versão inválidos." }, { status: 400 });
  }
  let rows;
  try { rows = flowRows(parseFlow(body)); } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.rpc("save_process_flow", {
    p_process_id: processId, p_nodes: rows.nodes, p_edges: rows.edges,
    p_expected_version: expectedVersion ?? null,
  });
  if (error) {
    const missing = /could not find.*function|schema cache|does not exist/i.test(error.message);
    const conflict = error.message.includes("FLOW_VERSION_CONFLICT");
    return Response.json({ error: missing
      ? "Aplique a migração 005_atomic_flow_save.sql para habilitar o salvamento seguro."
      : conflict ? "Este fluxo foi alterado em outra sessão. Reabra o processo antes de salvar." : error.message }, { status: missing || conflict ? 409 : 500 });
  }
  return Response.json({ version: data });
}
