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

function folderKey(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/** Encontra a pasta cujo nome casa com `name` (sem acento/caixa) ou cria uma na
 * raiz. Retorna o id, ou null se as pastas não estão ativas / algo falhou —
 * assim o salvamento nunca quebra por causa disto (DAT-02). */
export async function findOrCreateFolderByName(name: string): Promise<string | null> {
  const clean = (name ?? "").trim();
  if (!clean) return null;
  const supabase = supabaseAdmin();

  const existing = await supabase.from("process_folder").select("id,name");
  if (existing.error) return null; // tabela ausente (migração 003 pendente) → degrada
  const key = folderKey(clean);
  const hit = (existing.data as { id: string; name: string }[]).find((f) => folderKey(f.name) === key);
  if (hit) return hit.id;

  const created = await supabase.from("process_folder").insert({ name: clean, parent_id: null }).select("id").single();
  if (created.error || !created.data) return null;
  return created.data.id as string;
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
