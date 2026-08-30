import { supabaseAdmin } from "@/lib/supabase/server";
import { findOrCreateOwner } from "@/lib/queries/owner";
import { findOrCreateFolderByName } from "@/lib/queries/folders";
import { processCode } from "@/lib/slug";
import { computeLayout, handleForLabel, laneNodeId, sanitizePreMapping, type PreMapping } from "@/lib/premapping";
import { canonicalSystemName } from "@/lib/systems";

interface Body {
  draft: PreMapping;
  conversationId?: string | null;
}

/** Canonicaliza + deduplica uma lista de sistemas (CON-01). */
function canonList(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const c = canonicalSystemName(n);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/** Departamento do processo: usa o informado ou, se vazio, o executor (raia)
 * mais frequente das etapas — assim o processo já nasce ligado a uma área no
 * grafo (CON-02) em vez de flutuar isolado. */
function resolveDepartment(draft: PreMapping): string | null {
  if (draft.process.department?.trim()) return draft.process.department.trim();
  const counts = new Map<string, number>();
  for (const n of draft.nodes) {
    const a = n.actor?.trim();
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [a, c] of counts) {
    if (c > bestN) {
      best = a;
      bestN = c;
    }
  }
  return best;
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const draft = sanitizePreMapping(body.draft);
  const supabase = supabaseAdmin();

  // 1. owner
  const ownerId = await findOrCreateOwner(supabase, draft.process.owner, draft.process.ownerRole);

  // 2. process — departamento inferido (CON-02) + pasta sugerida pela área (DAT-02)
  const department = resolveDepartment(draft);
  const folderId = department ? await findOrCreateFolderByName(department) : null;
  const code = processCode(draft.process.name);
  const { data: process, error: processError } = await supabase
    .from("process")
    .insert({
      name: draft.process.name,
      code,
      department,
      criticality: draft.process.criticality || null,
      status: "rascunho",
      version: 1,
      objective: draft.process.objective ?? null,
      trigger_desc: draft.process.trigger ?? null,
      outputs: draft.process.outputs ?? null,
      frequency: draft.process.frequency ?? null,
      sla: draft.process.sla ?? null,
      owner_id: ownerId,
      uses_ai: draft.process.usesAI ?? false,
      ai_detail: draft.process.aiDetail ?? null,
      esg_tags: draft.process.esgTags ?? [],
      ...(folderId ? { folder_id: folderId } : {}),
    })
    .select("id")
    .single();
  if (processError) return Response.json({ error: processError.message }, { status: 500 });
  const processId = process.id as string;

  // 3. flow_node + raias (layout calculado no servidor, idêntico ao preview) —
  //    persistimos as raias (kind='lane') para o modelador mostrar exatamente as
  //    mesmas swimlanes que a pessoa validou, já editáveis.
  const { positions, lanes } = computeLayout(draft.nodes, draft.edges);
  const laneRows = lanes.map((lane) => ({
    process_id: processId,
    node_id: laneNodeId(lane.key),
    kind: "lane",
    label: lane.label,
    actor: null,
    activity_type: null,
    alert_frequency: null,
    tags: [] as string[],
    uses_ai: false,
    pos_x: 0,
    pos_y: lane.y,
    attributes: { colorIndex: lane.index, height: lane.height, order: lane.index },
  }));
  const nodeRows = draft.nodes.map((n) => ({
    process_id: processId,
    node_id: n.id,
    kind: n.kind,
    label: n.label,
    actor: n.actor ?? null,
    activity_type: n.kind === "task" ? n.activityType || "manual" : null,
    alert_frequency: null,
    tags: [] as string[],
    uses_ai: false,
    pos_x: positions.get(n.id)?.x ?? 0,
    pos_y: positions.get(n.id)?.y ?? 0,
    attributes: n.systems && n.systems.length ? { systems: canonList(n.systems) } : {},
  }));
  const allRows = [...laneRows, ...nodeRows];
  if (allRows.length > 0) {
    const { error } = await supabase.from("flow_node").insert(allRows);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // 4. flow_edge
  if (draft.edges.length > 0) {
    const edgeRows = draft.edges.map((e, i) => ({
      process_id: processId,
      edge_id: `e-${e.source}-${e.target}-${i}`,
      source_id: e.source,
      target_id: e.target,
      source_handle: handleForLabel(e.label),
      label: e.label ?? null,
    }));
    const { error } = await supabase.from("flow_edge").insert(edgeRows);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // 5. system_dependency — nomes canonicalizados (CON-01), deduplicados
  if (draft.systems.length > 0) {
    const seen = new Set<string>();
    const rows = draft.systems
      .map((s) => ({ name: canonicalSystemName(s.name), isPrimary: s.isPrimary ?? false }))
      .filter((s) => s.name && (seen.has(s.name) ? false : (seen.add(s.name), true)))
      .map((s) => ({ process_id: processId, system_name: s.name, is_primary: s.isPrimary }));
    if (rows.length) {
      const { error } = await supabase.from("system_dependency").insert(rows);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
  }

  // 6. improvement_opportunity (recomendações da IA)
  if (draft.recommendations.length > 0) {
    const { error } = await supabase.from("improvement_opportunity").insert(
      draft.recommendations.map((r) => ({
        process_id: processId,
        title: r.detail ? `${r.title} — ${r.detail}` : r.title,
        priority: r.priority || null,
      })),
    );
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // 7. vincula a conversa (se houver)
  if (body.conversationId) {
    await supabase
      .from("ai_conversation")
      .update({ process_id: processId, status: "concluida", updated_at: new Date().toISOString() })
      .eq("id", body.conversationId);
  }

  return Response.json({ processId, code });
}
