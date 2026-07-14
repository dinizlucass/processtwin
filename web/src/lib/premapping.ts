import type { Edge, Node } from "@xyflow/react";
import type { ActivityType, FlowNodeData, NodeKind } from "@/lib/flow-types";

// ---------- Tipos do pré-mapeamento (saída da IA) ----------

export interface DraftProcess {
  name: string;
  owner?: string;
  ownerRole?: string;
  department?: string;
  criticality?: "alta" | "media" | "baixa" | "";
  objective?: string;
  trigger?: string;
  outputs?: string;
  frequency?: string;
  sla?: string;
  usesAI?: boolean;
  aiDetail?: string;
  esgTags?: string[];
}

export interface DraftSystem {
  name: string;
  isPrimary?: boolean;
  role?: string;
}

export interface DraftNode {
  id: string;
  kind: NodeKind;
  label: string;
  actor?: string;
  activityType?: ActivityType | "";
  systems?: string[];
}

export interface DraftEdge {
  source: string;
  target: string;
  label?: string;
}

export interface DraftRecommendation {
  title: string;
  detail?: string;
  priority?: "P1" | "P2" | "P3" | "";
}

export interface PreMapping {
  process: DraftProcess;
  systems: DraftSystem[];
  nodes: DraftNode[];
  edges: DraftEdge[];
  recommendations: DraftRecommendation[];
}

const VALID_KINDS: NodeKind[] = ["start", "end", "task", "decision"];
const VALID_ACTIVITY: ActivityType[] = ["manual", "semiautomatica", "automatizada"];

// ---------- Sanitização do que a IA devolveu ----------

export function sanitizePreMapping(raw: Partial<PreMapping>): PreMapping {
  const process: DraftProcess = {
    name: raw.process?.name?.trim() || "Processo sem nome",
    owner: raw.process?.owner?.trim() || undefined,
    ownerRole: raw.process?.ownerRole?.trim() || undefined,
    department: raw.process?.department?.trim() || undefined,
    criticality: (["alta", "media", "baixa"].includes(raw.process?.criticality ?? "")
      ? raw.process?.criticality
      : "") as DraftProcess["criticality"],
    objective: raw.process?.objective?.trim() || undefined,
    trigger: raw.process?.trigger?.trim() || undefined,
    outputs: raw.process?.outputs?.trim() || undefined,
    frequency: raw.process?.frequency?.trim() || undefined,
    sla: raw.process?.sla?.trim() || undefined,
    usesAI: Boolean(raw.process?.usesAI),
    aiDetail: raw.process?.aiDetail?.trim() || undefined,
    esgTags: (raw.process?.esgTags ?? []).map((t) => t.trim()).filter(Boolean),
  };

  // nós válidos
  let nodes: DraftNode[] = (raw.nodes ?? [])
    .filter((n) => n && n.id && VALID_KINDS.includes(n.kind))
    .map((n) => ({
      id: String(n.id),
      kind: n.kind,
      label: n.label?.trim() || "Etapa",
      actor: n.actor?.trim() || undefined,
      activityType:
        n.kind === "task"
          ? ((VALID_ACTIVITY.includes(n.activityType as ActivityType) ? n.activityType : "manual") as ActivityType)
          : undefined,
      systems: (n.systems ?? []).map((s) => s.trim()).filter(Boolean),
    }));

  const idSet = new Set(nodes.map((n) => n.id));

  // garante um start e um end
  if (!nodes.some((n) => n.kind === "start")) {
    nodes.unshift({ id: "start", kind: "start", label: "Início" });
    idSet.add("start");
  }
  if (!nodes.some((n) => n.kind === "end")) {
    nodes.push({ id: "end", kind: "end", label: "Fim" });
    idSet.add("end");
  }

  // arestas que referenciam nós existentes
  const edges: DraftEdge[] = (raw.edges ?? [])
    .filter((e) => e && idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target)
    .map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label?.trim() || undefined,
    }));

  const systems: DraftSystem[] = (raw.systems ?? [])
    .filter((s) => s && s.name?.trim())
    .map((s) => ({ name: s.name.trim(), isPrimary: Boolean(s.isPrimary), role: s.role?.trim() || undefined }));

  const recommendations: DraftRecommendation[] = (raw.recommendations ?? [])
    .filter((r) => r && r.title?.trim())
    .map((r) => ({
      title: r.title.trim(),
      detail: r.detail?.trim() || undefined,
      priority: (["P1", "P2", "P3"].includes(r.priority ?? "") ? r.priority : "") as DraftRecommendation["priority"],
    }));

  nodes = dedupeById(nodes);

  return { process, systems, nodes, edges, recommendations };
}

function dedupeById(nodes: DraftNode[]): DraftNode[] {
  const seen = new Set<string>();
  return nodes.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
}

// ---------- Auto-layout (longest-path em camadas + barycenter) ----------

const COL_GAP = 240;
const ROW_GAP = 130;
const ORIGIN_X = 40;
const CENTER_Y = 240;

export function layoutNodes(nodes: DraftNode[], edges: DraftEdge[]): Map<string, { x: number; y: number }> {
  const ids = nodes.map((n) => n.id);
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const e of edges) {
    out.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }

  // ordenação topológica (Kahn); resto anexado se houver ciclo
  const deg = new Map(indeg);
  const queue = ids.filter((id) => (deg.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const t of out.get(n) ?? []) {
      deg.set(t, (deg.get(t) ?? 0) - 1);
      if ((deg.get(t) ?? 0) === 0) queue.push(t);
    }
  }
  for (const id of ids) if (!order.includes(id)) order.push(id);

  // camada = maior caminho a partir de uma fonte
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const n of order) {
    for (const t of out.get(n) ?? []) {
      layer.set(t, Math.max(layer.get(t) ?? 0, (layer.get(n) ?? 0) + 1));
    }
  }

  // agrupa por camada preservando a ordem de descoberta
  const byLayer = new Map<number, string[]>();
  for (const id of order) {
    const l = layer.get(id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(id);
  }

  // uma passada de barycenter: ordena cada camada pela média da posição dos pais
  const parents = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) parents.get(e.target)!.push(e.source);

  const slotIndex = new Map<string, number>();
  const maxLayer = Math.max(0, ...Array.from(byLayer.keys()));
  for (let l = 0; l <= maxLayer; l++) {
    const layerIds = byLayer.get(l) ?? [];
    if (l > 0) {
      layerIds.sort((a, b) => barycenter(a, parents, slotIndex) - barycenter(b, parents, slotIndex));
    }
    layerIds.forEach((id, i) => slotIndex.set(id, i));
    byLayer.set(l, layerIds);
  }

  // coordenadas — centraliza cada camada em torno de CENTER_Y
  const pos = new Map<string, { x: number; y: number }>();
  for (let l = 0; l <= maxLayer; l++) {
    const layerIds = byLayer.get(l) ?? [];
    const k = layerIds.length;
    layerIds.forEach((id, i) => {
      pos.set(id, {
        x: ORIGIN_X + l * COL_GAP,
        y: CENTER_Y + (i - (k - 1) / 2) * ROW_GAP,
      });
    });
  }
  return pos;
}

function barycenter(id: string, parents: Map<string, string[]>, slotIndex: Map<string, number>): number {
  const ps = parents.get(id) ?? [];
  if (ps.length === 0) return 0;
  const sum = ps.reduce((acc, p) => acc + (slotIndex.get(p) ?? 0), 0);
  return sum / ps.length;
}

// ---------- Conversão para React Flow (posicionado + estilizado) ----------

export function edgeVisual(label?: string): Partial<Edge> {
  if (label === "Sim") {
    return {
      label,
      sourceHandle: "yes",
      labelStyle: { fill: "#059669", fontWeight: 700, fontSize: 11 },
      style: { stroke: "#94a3b8" },
    };
  }
  if (label === "Não") {
    return {
      label,
      sourceHandle: "no",
      labelStyle: { fill: "#dc2626", fontWeight: 700, fontSize: 11 },
      style: { stroke: "#94a3b8", strokeDasharray: "5 4" },
    };
  }
  return { style: { stroke: "#94a3b8" } };
}

export function toReactFlow(pm: PreMapping): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const pos = layoutNodes(pm.nodes, pm.edges);

  const nodes: Node<FlowNodeData>[] = pm.nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: pos.get(n.id) ?? { x: 0, y: 0 },
    data: {
      kind: n.kind,
      label: n.label,
      actor: n.actor,
      activityType: (n.activityType || undefined) as ActivityType | undefined,
      systems: n.systems && n.systems.length ? n.systems : [],
      tags: [],
      usesAI: false,
    },
  }));

  const edges: Edge[] = pm.edges.map((e, i) => ({
    id: `e-${e.source}-${e.target}-${i}`,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    ...edgeVisual(e.label),
  }));

  return { nodes, edges };
}

export function handleForLabel(label?: string): string | null {
  if (label === "Sim") return "yes";
  if (label === "Não") return "no";
  return null;
}
