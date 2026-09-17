import { ATTRIBUTE_KEYS, NODE_META, type FlowNodeData } from "@/lib/flow-types";

export interface PersistableFlow {
  nodes: { id: string; position: { x: number; y: number }; data: FlowNodeData }[];
  edges: { id: string; source: string; target: string; sourceHandle?: string | null; label?: unknown }[];
  lanes: { id: string; label: string; posY: number; colorIndex: number; height: number; order: number }[];
}

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const strings = (value: unknown) => Array.isArray(value) && value.every((v) => typeof v === "string");

/** Shared by updates and the first atomic commit; validate before any mutation. */
export function parseFlow(input: unknown): PersistableFlow {
  const invalid = (): never => { throw new Error("Fluxo inválido: confira elementos, propriedades, posições e conexões."); };
  if (!input || typeof input !== "object") return invalid();
  const flow = input as PersistableFlow;
  const { nodes, edges, lanes = [] } = flow;
  if (!Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(lanes) || nodes.length > 5000 || edges.length > 10000 || lanes.length > 200) return invalid();
  const ids = new Set<string>();
  for (const n of nodes) {
    if (!n || typeof n.id !== "string" || !n.id || ids.has(n.id) || !n.data || !Object.hasOwn(NODE_META, n.data.kind) || typeof n.data.label !== "string" || !Number.isFinite(n.position?.x) || !Number.isFinite(n.position?.y)) return invalid();
    for (const key of ["actor", "alertFrequency", ...ATTRIBUTE_KEYS.filter((k) => k !== "systems")] as const) {
      if (n.data[key] != null && typeof n.data[key] !== "string") return invalid();
    }
    if ((n.data.tags != null && !strings(n.data.tags)) || (n.data.systems != null && !strings(n.data.systems)) || (n.data.usesAI != null && typeof n.data.usesAI !== "boolean")) return invalid();
    if (n.data.activityType != null && !["manual", "semiautomatica", "automatizada"].includes(n.data.activityType)) return invalid();
    ids.add(n.id);
  }
  const edgeIds = new Set<string>();
  for (const e of edges) {
    if (!e || typeof e.id !== "string" || !e.id || edgeIds.has(e.id) || !ids.has(e.source) || !ids.has(e.target) || e.source === e.target || (e.label != null && typeof e.label !== "string") || (e.sourceHandle != null && typeof e.sourceHandle !== "string")) return invalid();
    edgeIds.add(e.id);
  }
  for (const lane of lanes) {
    if (!lane || typeof lane.id !== "string" || !lane.id || ids.has(lane.id) || typeof lane.label !== "string" || !Number.isFinite(lane.posY) || !Number.isFinite(lane.height) || lane.height < 90 || !Number.isInteger(lane.colorIndex) || !Number.isInteger(lane.order)) return invalid();
    ids.add(lane.id);
  }
  return { nodes, edges, lanes };
}

export function flowRows(flow: PersistableFlow) {
  return {
    nodes: [
      ...flow.lanes.map((l) => ({ node_id: l.id, kind: "lane", label: l.label, actor: null, activity_type: null,
        alert_frequency: null, tags: [], uses_ai: false, pos_x: 0, pos_y: l.posY,
        attributes: { colorIndex: l.colorIndex, height: l.height, order: l.order } })),
      ...flow.nodes.map((n) => ({ node_id: n.id, kind: n.data.kind, label: n.data.label, actor: n.data.actor ?? null,
        activity_type: ["task", "subprocess"].includes(n.data.kind) ? n.data.activityType ?? null : null,
        alert_frequency: n.data.alertFrequency ?? null, tags: n.data.tags ?? [], uses_ai: n.data.usesAI ?? null,
        pos_x: n.position.x, pos_y: n.position.y,
        attributes: Object.fromEntries(ATTRIBUTE_KEYS.filter((key) => n.data[key] != null).map((key) => [key, n.data[key]])) })),
    ],
    edges: flow.edges.map((e) => ({ edge_id: e.id, source_id: e.source, target_id: e.target,
      source_handle: e.sourceHandle ?? null, label: e.label ?? null })),
  };
}
