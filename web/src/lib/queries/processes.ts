import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface ProcessListItem {
  id: string;
  name: string;
  code: string;
  department: string | null;
  criticality: "alta" | "media" | "baixa" | null;
  status: string;
  version: number;
  ownerName: string | null;
  mapped: boolean;
}

export async function listProcesses(): Promise<ProcessListItem[]> {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("process")
    .select("id,name,code,department,criticality,status,version,owner:owner_id(name)")
    .order("name");
  if (error) throw new Error(`Falha ao listar processos: ${error.message}`);

  const { data: mappedRows } = await supabase.from("flow_node").select("process_id");
  const mappedSet = new Set(((mappedRows ?? []) as { process_id: string }[]).map((r) => r.process_id));

  return (data as unknown as {
    id: string;
    name: string;
    code: string;
    department: string | null;
    criticality: "alta" | "media" | "baixa" | null;
    status: string;
    version: number;
    owner: { name: string } | null;
  }[]).map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    department: p.department,
    criticality: p.criticality,
    status: p.status,
    version: p.version,
    ownerName: p.owner?.name ?? null,
    mapped: mappedSet.has(p.id),
  }));
}
