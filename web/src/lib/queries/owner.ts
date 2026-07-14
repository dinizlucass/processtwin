import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Busca um owner pelo nome ou cria um novo. Retorna o id (ou null se sem nome).
export async function findOrCreateOwner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  name?: string,
  role?: string,
): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase.from("process_owner").select("id").eq("name", trimmed).maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await supabase
    .from("process_owner")
    .insert({ name: trimmed, role: role?.trim() || null })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar owner: ${error.message}`);
  return data.id as string;
}
