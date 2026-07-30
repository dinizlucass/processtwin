import { supabaseAdmin } from "@/lib/supabase/server";
import { findOrCreateOwner } from "@/lib/queries/owner";
import { processCode } from "@/lib/slug";
import { computeLayout, handleForLabel, laneNodeId, sanitizePreMapping, type PreMapping } from "@/lib/premapping";

interface Body {
  draft: PreMapping;
  conversationId?: string | null;
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const draft = sanitizePreMapping(body.draft);
  const supabase = supabaseAdmin();

  // 1. owner
  const ownerId = await findOrCreateOwner(supabase, draft.process.owner, draft.process.ownerRole);

  // 2. process
  const code = processCode(draft.process.name);
  const { data: process, error: processError } = await supabase
    .from("process")
    .insert({
      name: draft.process.name,
      code,
      department: draft.process.department ?? null,
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
    attributes: n.systems && n.systems.length ? { systems: n.systems } : {},
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

  // 5. system_dependency
  if (draft.systems.length > 0) {
    const { error } = await supabase.from("system_dependency").insert(
      draft.systems.map((s) => ({
        process_id: processId,
        system_name: s.name,
        is_primary: s.isPrimary ?? false,
      })),
    );
    if (error) return Response.json({ error: error.message }, { status: 500 });
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
