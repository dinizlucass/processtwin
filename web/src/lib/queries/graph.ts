import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listProcesses, type ProcessListItem } from "@/lib/queries/processes";
import { listFolders, foldersEnabled } from "@/lib/queries/folders";
import type { FolderRow } from "@/lib/folders";
import { canonicalSystemName } from "@/lib/systems";
import { inferHandoffCandidates, type ProcessIO, type Handoff } from "@/lib/handoffs";

export interface ProcessGraphData {
  processes: ProcessListItem[];
  folders: FolderRow[];
  foldersEnabled: boolean;
  systemsByProcess: Record<string, string[]>;
  handoffs: Handoff[]; // relações processo→processo (confirmadas + inferidas)
}

/**
 * Sistemas por processo — agrega duas fontes, CANONICALIZA (CON-01) e nunca lança:
 *  1) system_dependency.system_name (gravado no commit/criação)
 *  2) flow_node.attributes.systems (jsonb string[])
 * Se alguma tabela/coluna não existir, aquela fonte simplesmente não contribui.
 */
async function aggregateSystems(supabase: ReturnType<typeof supabaseAdmin>): Promise<Record<string, string[]>> {
  const acc: Record<string, Set<string>> = {};
  const add = (pid: unknown, name: unknown) => {
    const n = typeof name === "string" ? canonicalSystemName(name) : "";
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

/**
 * Handoffs processo→processo (CON-03): relações explícitas confirmadas
 * (tabela process_relationship, migração 004) somadas às inferidas por
 * artefatos compartilhados (saída de A ≈ gatilho/nome de B). Degrada a só
 * inferidas se a tabela ainda não existir.
 */
async function loadHandoffs(
  supabase: ReturnType<typeof supabaseAdmin>,
  systemsByProcess: Record<string, string[]>,
): Promise<Handoff[]> {
  // I/O textual dos processos para a inferência
  const io = await supabase.from("process").select("id,name,trigger_desc,outputs");
  const ioRows: ProcessIO[] = io.error
    ? []
    : ((io.data ?? []) as { id: string; name: string; trigger_desc: string | null; outputs: string | null }[]).map((r) => ({
        id: r.id,
        name: r.name,
        trigger: r.trigger_desc,
        outputs: r.outputs,
        systems: systemsByProcess[r.id] ?? [],
      }));

  const confirmed = new Map<string, Handoff>();
  const rel = await supabase.from("process_relationship").select("id,from_process,to_process,label");
  if (!rel.error) {
    for (const r of (rel.data ?? []) as { id: string; from_process: string; to_process: string; label: string | null }[]) {
      confirmed.set(`${r.from_process}->${r.to_process}`, {
        source: r.from_process,
        target: r.to_process,
        label: r.label ?? undefined,
        confirmed: true,
        relationshipId: r.id,
      });
    }
  }

  const inferred = inferHandoffCandidates(ioRows);
  const merged = new Map(confirmed);
  for (const h of inferred) {
    const key = `${h.source}->${h.target}`;
    if (!merged.has(key)) merged.set(key, h);
  }
  return [...merged.values()];
}

export async function getProcessGraphData(): Promise<ProcessGraphData> {
  const supabase = supabaseAdmin();
  const [processes, folders, enabled, systemsByProcess] = await Promise.all([
    listProcesses(),
    listFolders(),
    foldersEnabled(),
    aggregateSystems(supabase),
  ]);
  const handoffs = await loadHandoffs(supabase, systemsByProcess);
  return { processes, folders, foldersEnabled: enabled, systemsByProcess, handoffs };
}
