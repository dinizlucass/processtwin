import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listProcesses, type ProcessListItem } from "@/lib/queries/processes";
import { listFolders, foldersEnabled } from "@/lib/queries/folders";
import type { FolderRow } from "@/lib/folders";

export interface ProcessGraphData {
  processes: ProcessListItem[];
  folders: FolderRow[];
  foldersEnabled: boolean;
  systemsByProcess: Record<string, string[]>;
}

/**
 * Sistemas por processo — agrega duas fontes e nunca lança:
 *  1) system_dependency.system_name (gravado no commit/criação)
 *  2) flow_node.attributes.systems (jsonb string[])
 * Se alguma tabela/coluna não existir, aquela fonte simplesmente não contribui.
 */
async function aggregateSystems(supabase: ReturnType<typeof supabaseAdmin>): Promise<Record<string, string[]>> {
  const acc: Record<string, Set<string>> = {};
  const add = (pid: unknown, name: unknown) => {
    const n = typeof name === "string" ? name.trim() : "";
    if (typeof pid === "string" && pid && n) (acc[pid] ??= new Set()).add(n);
  };

  const dep = await supabase.from("system_dependency").select("process_id,system_name");
  if (!dep.error) for (const r of (dep.data ?? []) as { process_id: string; system_name: string }[]) add(r.process_id, r.system_name);

  const flow = await supabase.from("flow_node").select("process_id,attributes");
  if (!flow.error)
    for (const r of (flow.data ?? []) as { process_id: string; attributes: { systems?: unknown } | null }[]) {
      const systems = r.attributes && Array.isArray(r.attributes.systems) ? r.attributes.systems : [];
      for (const s of systems) add(r.process_id, s);
    }

  const out: Record<string, string[]> = {};
  for (const [pid, set] of Object.entries(acc)) out[pid] = [...set];
  return out;
}

export async function getProcessGraphData(): Promise<ProcessGraphData> {
  const supabase = supabaseAdmin();
  const [processes, folders, enabled, systemsByProcess] = await Promise.all([
    listProcesses(),
    listFolders(),
    foldersEnabled(),
    aggregateSystems(supabase),
  ]);
  return { processes, folders, foldersEnabled: enabled, systemsByProcess };
}
