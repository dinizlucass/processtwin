import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AssistantCatalog, AssistantProcess, AssistantNode, AssistantEdge, AssistantRelationship, AssistantFact } from "@/lib/process-assistant";

const PAGE_SIZE = 500;
const MAX_ROWS = 20000;

async function allRows<T>(table: string, columns: string, publishedIds?: Set<string>, onMissing?: () => void): Promise<T[]> {
  const db = supabaseAdmin();
  const result: T[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const query = db.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
    if (table === "process" && process.env.PROCESS_ASSISTANT_SCOPE === "published") query.eq("status", "publicado");
    const { data, error } = await query;
    if (error) {
      // Older installations may not have every migration; surface the gap in every answer.
      if (onMissing && /does not exist|schema cache|could not find/i.test(error.message)) {
        onMissing();
        return [];
      }
      throw new Error(`Falha ao consultar ${table}: ${error.message}`);
    }
    const rows = (data || []) as T[];
    result.push(...(publishedIds ? rows.filter((row) => {
      const record = row as Record<string, unknown>;
      return publishedIds.has(String(record.process_id || record.from_process));
    }) : rows));
    if (rows.length < PAGE_SIZE) return result;
  }
  throw new Error(`Limite de ${MAX_ROWS} registros atingido em ${table}; consulta incompleta recusada.`);
}

export async function loadAssistantCatalog(): Promise<AssistantCatalog> {
  const warnings: string[] = [];
  const processes = await allRows<AssistantProcess>("process", "id,status,name,code,department,criticality,version,objective,scope,trigger_desc,inputs,outputs,frequency,sla,last_reviewed_at,owner:owner_id(name)");
  const ids = new Set(processes.map((p) => p.id));
  const [nodes, edges, relationships, systems, pains, opportunities] = await Promise.all([
    allRows<AssistantNode>("flow_node", "process_id,node_id,kind,label,actor,activity_type,uses_ai,attributes", ids),
    allRows<AssistantEdge>("flow_edge", "process_id,source_id,target_id,label", ids),
    allRows<AssistantRelationship>("process_relationship", "from_process,to_process,kind,label", undefined, () => warnings.push("Relações confirmadas indisponíveis: migração 004 pendente")),
    allRows<AssistantFact>("system_dependency", "process_id,system_name,is_primary", ids),
    allRows<AssistantFact>("process_pain_point", "process_id,description", ids, () => warnings.push("Dores indisponíveis: migração 007 pendente")),
    allRows<AssistantFact>("improvement_opportunity", "process_id,title", ids),
  ]);
  return { processes, nodes, edges, relationships: relationships.filter((r) => ids.has(r.from_process) && ids.has(r.to_process)), systems, pains, opportunities, warnings,
    scopeLabel: process.env.PROCESS_ASSISTANT_SCOPE === "published"
      ? "Somente processos publicados; indicadores de cadastro/mapeamento, não de execução real"
      : "Todos os processos do repositório, inclusive rascunhos e em revisão (dados provisórios); indicadores de cadastro/mapeamento, não de execução real" };
}
