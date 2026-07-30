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
  folderId: string | null;
}

const BASE_COLS = "id,name,code,department,criticality,status,version,owner:owner_id(name)";

export async function listProcesses(): Promise<ProcessListItem[]> {
  const supabase = supabaseAdmin();

  // tenta incluir folder_id; se a coluna ainda não existe (migração 003 pendente), refaz sem ela
  let rows = (await supabase.from("process").select(`${BASE_COLS},folder_id`).order("name")) as {
    data: unknown[] | null;
    error: { message: string } | null;
  };
  let hasFolder = true;
  if (rows.error) {
    if (/folder_id|does not exist|schema cache/i.test(rows.error.message)) {
      hasFolder = false;
      rows = (await supabase.from("process").select(BASE_COLS).order("name")) as typeof rows;
    }
    if (rows.error) throw new Error(`Falha ao listar processos: ${rows.error.message}`);
  }

  const { data: mappedRows } = await supabase.from("flow_node").select("process_id");
  const mappedSet = new Set(((mappedRows ?? []) as { process_id: string }[]).map((r) => r.process_id));

  return (rows.data as {
    id: string;
    name: string;
    code: string;
    department: string | null;
    criticality: "alta" | "media" | "baixa" | null;
    status: string;
    version: number;
    owner: { name: string } | null;
    folder_id?: string | null;
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
    folderId: hasFolder ? p.folder_id ?? null : null,
  }));
}
