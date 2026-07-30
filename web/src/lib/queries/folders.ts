import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { FolderRow } from "@/lib/folders";

interface Row {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  position: number;
}

/** Lista todas as pastas. Se a tabela ainda não existe (migração 003 pendente),
 * retorna [] — o repositório cai no modo lista-plana sem quebrar. */
export async function listFolders(): Promise<FolderRow[]> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("process_folder")
    .select("id,name,parent_id,color,position")
    .order("position")
    .order("name");
  if (error) {
    if (/does not exist|could not find|schema cache/i.test(error.message)) return [];
    throw new Error(`Falha ao listar pastas: ${error.message}`);
  }
  return (data as Row[]).map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parent_id,
    color: f.color,
    position: f.position,
  }));
}

/** true se a tabela process_folder existe (migração 003 aplicada). Usa um select
 * normal (não head) para que o corpo do erro chegue quando a tabela não existe. */
export async function foldersEnabled(): Promise<boolean> {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("process_folder").select("id").limit(1);
  if (!error) return true;
  if (/does not exist|could not find|schema cache/i.test(error.message)) return false;
  return true; // outro erro: assume disponível para não esconder problema real
}
