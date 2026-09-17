import { computeLayout, handleForLabel, laneNodeId, sanitizePreMapping, type PreMapping } from "@/lib/premapping";
import { flowRows, isUuid, parseFlow, type PersistableFlow } from "@/lib/flow-persistence";
import { canonicalSystemName } from "@/lib/systems";
import { validateFlow } from "@/lib/flow-analysis";

/** Prepare the complete transaction without writing anything to the database. */
export function prepareMappingCommit(input: unknown) {
  const body = input as { requestId?: string; conversationId?: string | null; draft?: PreMapping; flow?: PersistableFlow; acceptReviewIssues?: boolean };
  if (!body || !isUuid(body.requestId) || (body.conversationId != null && !isUuid(body.conversationId))) throw new Error("Informe uma chave de idempotência e uma conversa válidas.");
  const raw = body.draft;
  if (!raw || typeof raw.process?.name !== "string" || !raw.process.name.trim() || !Array.isArray(raw.nodes) || !raw.nodes.length || !Array.isArray(raw.edges) || raw.nodes.length > 5000 || raw.edges.length > 10000) throw new Error("Pré-mapeamento inválido ou vazio.");
  if (new Set(raw.nodes.map((n) => n?.id)).size !== raw.nodes.length) throw new Error("O pré-mapeamento contém identificadores repetidos.");
  const rawIds = new Set(raw.nodes.map((n) => n?.id));
  if (raw.edges.some((e) => !e || !rawIds.has(e.source) || !rawIds.has(e.target) || e.source === e.target)) throw new Error("O pré-mapeamento contém conexões inválidas.");
  const draft = sanitizePreMapping(raw);
  let flow: PersistableFlow;
  if (body.flow != null) {
    flow = parseFlow(body.flow);
    if (!flow.nodes.length) throw new Error("Adicione elementos antes de concluir o mapeamento.");
  } else {
    const { positions, lanes } = computeLayout(draft.nodes, draft.edges);
    flow = parseFlow({
      nodes: draft.nodes.map((n) => ({ id: n.id, position: positions.get(n.id), data: {
        kind: n.kind, label: n.label, actor: n.actor, activityType: n.activityType || undefined, systems: n.systems ?? [], description: n.description, sla: n.sla,
      } })),
      edges: draft.edges.map((e, i) => ({ id: `e-${i}`, source: e.source, target: e.target, sourceHandle: handleForLabel(e.label), label: e.label })),
      lanes: lanes.map((l) => ({ id: laneNodeId(l.key), label: l.label, posY: l.y, colorIndex: l.index, height: l.height, order: l.index })),
    });
  }
  const structuralIssues = validateFlow(
    flow.nodes.map((node) => ({ id: node.id, type: node.data.kind, position: node.position, data: node.data })),
    flow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      label: typeof edge.label === "string" ? edge.label : undefined,
    })),
  );
  if (structuralIssues.length) throw new Error(`Corrija a estrutura antes de concluir: ${structuralIssues.join(" ")}`);
  if (draft.reviewIssues?.length && body.acceptReviewIssues !== true) {
    throw new Error("A revisão encontrou pontos pendentes. Corrija o mapa ou aceite explicitamente os avisos antes de concluir.");
  }
  const systems = new Map<string, boolean | undefined>();
  for (const s of draft.systems) {
    const name = canonicalSystemName(s.name);
    if (name) systems.set(name, systems.get(name) === true ? true : s.isPrimary);
  }
  flow = { ...flow, nodes: flow.nodes.map((n) => ({ ...n, data: { ...n.data, systems: [...new Set((n.data.systems ?? []).map(canonicalSystemName).filter(Boolean))] } })) };
  for (const n of flow.nodes) for (const system of n.data.systems ?? []) if (!systems.has(system)) systems.set(system, undefined);
  const actors = new Map<string, number>();
  for (const n of flow.nodes) if (n.data.actor?.trim()) actors.set(n.data.actor.trim(), (actors.get(n.data.actor.trim()) ?? 0) + 1);
  const department = draft.process.department || [...actors].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const p = draft.process;
  const rows = flowRows(flow);
  return { requestId: body.requestId, payload: {
    conversation_id: body.conversationId ?? null,
    owner: p.owner ? { name: p.owner, role: p.ownerRole ?? null } : null,
    folder: department,
    process: { name: p.name, department, criticality: p.criticality || null, objective: p.objective ?? null,
      trigger_desc: p.trigger ?? null, outputs: p.outputs ?? null, frequency: p.frequency ?? null, sla: p.sla ?? null,
      uses_ai: p.usesAI ?? null, ai_detail: p.aiDetail ?? null, esg_tags: p.esgTags ?? [] },
    ...rows,
    systems: [...systems].sort(([a], [b]) => a.localeCompare(b)).map(([system_name, is_primary]) => ({ system_name, is_primary: is_primary ?? null })),
    pain_points: p.painPoints ?? [],
    recommendations: [
      ...draft.recommendations.map((r) => ({ title: r.detail ? `${r.title} — ${r.detail}` : r.title, priority: r.priority || null })),
      ...(p.opportunities ?? []).map((title) => ({ title, priority: null })),
    ],
  } };
}
