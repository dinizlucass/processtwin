import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import { NODE_SIZE, type ActivityType, type FlowNodeData, type NodeKind } from "@/lib/flow-types";

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
  nodes = splitSharedEnds(nodes, edges);

  return { process, systems, nodes, edges, recommendations };
}

/**
 * Eventos de fim múltiplos: quando várias arestas convergem para um único 'end'
 * distante, elas viram linhas longas cruzando o diagrama. Damos a cada ramo que
 * termina o seu próprio "Fim" ao lado (padrão ARIS/BPMN).
 */
function splitSharedEnds(nodes: DraftNode[], edges: DraftEdge[]): DraftNode[] {
  const removeIds = new Set<string>();
  for (const endNode of nodes.filter((n) => n.kind === "end")) {
    const incoming = edges.filter((e) => e.target === endNode.id);
    if (incoming.length <= 1) continue;
    incoming.forEach((e, i) => {
      const newId = `${endNode.id}__${i}`;
      nodes.push({ id: newId, kind: "end", label: endNode.label });
      e.target = newId;
    });
    removeIds.add(endNode.id);
  }
  return removeIds.size ? nodes.filter((n) => !removeIds.has(n.id)) : nodes;
}

function dedupeById(nodes: DraftNode[]): DraftNode[] {
  const seen = new Set<string>();
  return nodes.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
}

// ---------- Auto-layout em SWIMLANES (colunas = ordem, linhas = ator) ----------

const LANE_LABEL_W = 128; // largura da faixa de rótulo à esquerda de cada raia
const SLOT_LEFT = LANE_LABEL_W + 44; // onde começa a 1ª coluna de nós
const COL_GAP = 248; // distância entre centros de coluna
const ROW_H = 108; // altura de cada sub-linha dentro de uma raia
const LANE_PAD = 22; // respiro vertical dentro da raia
const RIGHT_PAD = 72; // respiro à direita da última coluna
const TASK_W = NODE_SIZE.task.width;

const UNASSIGNED_LANE = "—";

export interface LaneInfo {
  key: string; // ator (chave de agrupamento)
  label: string; // rótulo exibido na faixa
  index: number; // ordem de cima para baixo
  y: number; // topo da raia
  height: number;
}

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  lanes: LaneInfo[];
  totalWidth: number;
  columnOf: Map<string, number>;
}

/**
 * Calcula colunas (avanço do processo, via longest-path) e raias (por ator),
 * empilhando nós que caem na mesma célula raia×coluna em sub-linhas.
 */
export function computeLayout(nodes: DraftNode[], edges: DraftEdge[]): LayoutResult {
  const ids = nodes.map((n) => n.id);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const inn = new Map<string, string[]>(ids.map((id) => [id, []]));
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const e of edges) {
    if (!out.has(e.source) || !inn.has(e.target)) continue;
    out.get(e.source)!.push(e.target);
    inn.get(e.target)!.push(e.source);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }

  // ordenação topológica (Kahn); resto anexado se houver ciclo
  const deg = new Map(indeg);
  const queue = ids.filter((id) => (deg.get(id) ?? 0) === 0);
  const order: string[] = [];
  const inOrder = new Set<string>();
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    inOrder.add(n);
    for (const t of out.get(n) ?? []) {
      deg.set(t, (deg.get(t) ?? 0) - 1);
      if ((deg.get(t) ?? 0) === 0) queue.push(t);
    }
  }
  for (const id of ids) if (!inOrder.has(id)) order.push(id);
  const orderIndex = new Map<string, number>(order.map((id, i) => [id, i]));

  // coluna = maior caminho a partir de uma fonte, ignorando arestas de retorno
  // (alvo antes da origem na ordem topológica) para não inflar as colunas.
  const columnOf = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const n of order) {
    for (const t of out.get(n) ?? []) {
      if ((orderIndex.get(t) ?? 0) <= (orderIndex.get(n) ?? 0)) continue; // back edge
      columnOf.set(t, Math.max(columnOf.get(t) ?? 0, (columnOf.get(n) ?? 0) + 1));
    }
  }

  // raia = ator; propaga para nós sem ator (eventos/gateways herdam do vizinho)
  const laneKeyOf = new Map<string, string>();
  for (const n of nodes) if (n.actor) laneKeyOf.set(n.id, n.actor);
  // duas passadas: puxa do antecessor; depois do sucessor
  for (let pass = 0; pass < 3; pass++) {
    for (const id of order) {
      if (laneKeyOf.has(id)) continue;
      const pred = (inn.get(id) ?? []).find((p) => laneKeyOf.has(p));
      if (pred) laneKeyOf.set(id, laneKeyOf.get(pred)!);
    }
    for (const id of [...order].reverse()) {
      if (laneKeyOf.has(id)) continue;
      const succ = (out.get(id) ?? []).find((s) => laneKeyOf.has(s));
      if (succ) laneKeyOf.set(id, laneKeyOf.get(succ)!);
    }
  }
  for (const id of ids) if (!laneKeyOf.has(id)) laneKeyOf.set(id, UNASSIGNED_LANE);

  // ordem das raias: pela 1ª coluna em que o ator aparece, depois descoberta
  const laneFirstCol = new Map<string, number>();
  const laneFirstSeen = new Map<string, number>();
  order.forEach((id, i) => {
    const key = laneKeyOf.get(id)!;
    const col = columnOf.get(id) ?? 0;
    if (!laneFirstCol.has(key) || col < laneFirstCol.get(key)!) laneFirstCol.set(key, col);
    if (!laneFirstSeen.has(key)) laneFirstSeen.set(key, i);
  });
  const laneKeys = Array.from(new Set(order.map((id) => laneKeyOf.get(id)!)));
  laneKeys.sort((a, b) => {
    const ca = laneFirstCol.get(a) ?? 0;
    const cb = laneFirstCol.get(b) ?? 0;
    if (ca !== cb) return ca - cb;
    return (laneFirstSeen.get(a) ?? 0) - (laneFirstSeen.get(b) ?? 0);
  });
  const laneIndex = new Map(laneKeys.map((k, i) => [k, i]));

  // sub-linha dentro da raia p/ evitar colisão na mesma coluna
  const subRowOf = new Map<string, number>();
  const laneRows = new Map<string, number>(laneKeys.map((k) => [k, 1]));
  const cellCount = new Map<string, number>(); // `${lane}#${col}` -> quantos já ocupados
  for (const id of order) {
    const lane = laneKeyOf.get(id)!;
    const col = columnOf.get(id) ?? 0;
    const cellKey = `${lane}#${col}`;
    const sub = cellCount.get(cellKey) ?? 0;
    subRowOf.set(id, sub);
    cellCount.set(cellKey, sub + 1);
    laneRows.set(lane, Math.max(laneRows.get(lane) ?? 1, sub + 1));
  }

  // bandas verticais das raias
  const lanes: LaneInfo[] = [];
  let cursorY = 0;
  const laneY = new Map<string, number>();
  for (const key of laneKeys) {
    const rows = laneRows.get(key) ?? 1;
    const height = LANE_PAD * 2 + rows * ROW_H;
    laneY.set(key, cursorY);
    lanes.push({
      key,
      label: key === UNASSIGNED_LANE ? "Sem responsável" : key,
      index: laneIndex.get(key) ?? 0,
      y: cursorY,
      height,
    });
    cursorY += height;
  }

  // coordenadas finais (centraliza cada nó em sua célula)
  const maxCol = Math.max(0, ...ids.map((id) => columnOf.get(id) ?? 0));
  const positions = new Map<string, { x: number; y: number }>();
  for (const id of ids) {
    const node = byId.get(id)!;
    const col = columnOf.get(id) ?? 0;
    const lane = laneKeyOf.get(id)!;
    const sub = subRowOf.get(id) ?? 0;
    const size = NODE_SIZE[node.kind] ?? NODE_SIZE.task;
    const centerX = SLOT_LEFT + TASK_W / 2 + col * COL_GAP;
    const centerY = (laneY.get(lane) ?? 0) + LANE_PAD + sub * ROW_H + ROW_H / 2;
    positions.set(id, { x: centerX - size.width / 2, y: centerY - size.height / 2 });
  }

  const totalWidth = SLOT_LEFT + maxCol * COL_GAP + TASK_W + RIGHT_PAD;
  return { positions, lanes, totalWidth, columnOf };
}

/** Compat: só as posições (usado pela persistência do commit). */
export function layoutNodes(nodes: DraftNode[], edges: DraftEdge[]): Map<string, { x: number; y: number }> {
  return computeLayout(nodes, edges).positions;
}

// ---------- Raias como nós de fundo do React Flow ----------

export interface LaneNodeData extends Record<string, unknown> {
  label: string;
  width: number;
  height: number;
  labelWidth: number;
  tone: number; // índice p/ alternar cor
}

export function laneNodeId(key: string): string {
  return `lane::${key}`;
}

export function buildLaneNodes(lanes: LaneInfo[], totalWidth: number): Node<LaneNodeData>[] {
  return lanes.map((lane) => ({
    id: laneNodeId(lane.key),
    type: "lane",
    position: { x: 0, y: lane.y },
    width: totalWidth,
    height: lane.height,
    draggable: false,
    selectable: false,
    connectable: false,
    deletable: false,
    focusable: false,
    zIndex: -1,
    data: { label: lane.label, width: totalWidth, height: lane.height, labelWidth: LANE_LABEL_W, tone: lane.index },
  }));
}

/** Reconstrói as raias a partir de nós já posicionados (usado ao carregar do banco). */
export function deriveLaneNodes(nodes: Node<FlowNodeData>[]): Node<LaneNodeData>[] {
  const bounds = new Map<string, { minY: number; maxY: number }>();
  let maxRight = 0;
  for (const n of nodes) {
    const h = (n.height ?? n.initialHeight ?? NODE_SIZE[(n.data?.kind as NodeKind) ?? "task"]?.height ?? 72) as number;
    const w = (n.width ?? n.initialWidth ?? NODE_SIZE[(n.data?.kind as NodeKind) ?? "task"]?.width ?? 176) as number;
    maxRight = Math.max(maxRight, n.position.x + w);
    const actor = n.data?.actor?.trim();
    if (!actor) continue;
    const b = bounds.get(actor) ?? { minY: Infinity, maxY: -Infinity };
    b.minY = Math.min(b.minY, n.position.y);
    b.maxY = Math.max(b.maxY, n.position.y + h);
    bounds.set(actor, b);
  }
  if (bounds.size === 0) return [];

  const totalWidth = Math.max(maxRight + RIGHT_PAD, SLOT_LEFT + TASK_W + RIGHT_PAD);
  const ordered = Array.from(bounds.entries()).sort((a, b) => a[1].minY - b[1].minY);
  return ordered.map(([actor, b], i) => {
    const y = b.minY - LANE_PAD;
    const height = b.maxY - b.minY + LANE_PAD * 2;
    return {
      id: laneNodeId(actor),
      type: "lane",
      position: { x: 0, y },
      width: totalWidth,
      height,
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      zIndex: -1,
      data: { label: actor, width: totalWidth, height, labelWidth: LANE_LABEL_W, tone: i },
    };
  });
}

// ---------- Roteamento das arestas por geometria ----------

const GREY = "#94a3b8";
const GREEN = "#059669";
const RED = "#dc2626";

// quais tipos aceitam entrada/saída pela base (handle id "b")
const BOTTOM_SOURCE = new Set<NodeKind>(["task", "subprocess", "data", "start", "intermediate"]);
const BOTTOM_TARGET = new Set<NodeKind>(["task", "subprocess", "data", "end", "intermediate"]);
const GATEWAYS = new Set<NodeKind>(["decision", "gateway_parallel", "gateway_inclusive"]);

function centerOf(n: Node): { x: number; y: number; kind: NodeKind } {
  const kind = ((n.data as FlowNodeData)?.kind ?? (n.type as NodeKind)) as NodeKind;
  const size = NODE_SIZE[kind] ?? NODE_SIZE.task;
  const w = (n.width ?? n.initialWidth ?? size.width) as number;
  const h = (n.height ?? n.initialHeight ?? size.height) as number;
  return { x: n.position.x + w / 2, y: n.position.y + h / 2, kind };
}

/**
 * Define handles + estilo de cada aresta a partir das posições dos nós:
 * - para frente → sai pela direita, entra pela esquerda;
 * - retorno/loop (alvo atrás) → sai e entra pela base, passando por baixo;
 * - ramo de gateway p/ outra raia → sai por cima/baixo conforme a direção.
 */
export function routeEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edges.map((e) => {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    const label = typeof e.label === "string" ? e.label : undefined;
    const base: Edge = {
      ...e,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: GREY },
    };
    if (!s || !t) return { ...base, style: strokeFor(label, false) };

    const a = centerOf(s);
    const b = centerOf(t);
    const forward = b.x > a.x + 8;
    const loop = b.x <= a.x + 8;
    const goingUp = b.y < a.y - 8;

    let sourceHandle: string | undefined;
    let targetHandle: string | undefined;

    if (GATEWAYS.has(a.kind)) {
      // gateway: cima="yes", baixo="no", direita="out"
      if (loop) sourceHandle = "no";
      else if (goingUp) sourceHandle = "yes";
      else if (b.y > a.y + 8) sourceHandle = "no";
      else sourceHandle = "out";
    } else {
      sourceHandle = loop && BOTTOM_SOURCE.has(a.kind) ? "b" : undefined; // undefined = direita
    }

    if (loop && BOTTOM_TARGET.has(b.kind)) targetHandle = "b"; // entra por baixo
    else targetHandle = undefined; // undefined = esquerda

    const dashed = label === "Não" || loop;
    return {
      ...base,
      sourceHandle,
      targetHandle,
      label,
      labelStyle: labelTextFor(label),
      style: strokeFor(label, loop),
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: dashed ? (label === "Não" ? RED : GREY) : GREY },
    };
  });
}

function strokeFor(label: string | undefined, loop: boolean): Edge["style"] {
  if (label === "Não") return { stroke: RED, strokeWidth: 1.5, strokeDasharray: "6 4" };
  if (loop) return { stroke: GREY, strokeWidth: 1.5, strokeDasharray: "6 4" };
  if (label === "Sim") return { stroke: GREEN, strokeWidth: 1.75 };
  return { stroke: GREY, strokeWidth: 1.5 };
}

function labelTextFor(label: string | undefined): Edge["labelStyle"] {
  if (label === "Sim") return { fill: GREEN, fontWeight: 700, fontSize: 11 };
  if (label === "Não") return { fill: RED, fontWeight: 700, fontSize: 11 };
  if (label) return { fill: "#475569", fontWeight: 700, fontSize: 11 };
  return undefined;
}

// ---------- Conversão para React Flow (posicionado + estilizado) ----------

export function toReactFlow(pm: PreMapping): { nodes: Node[]; edges: Edge[] } {
  const { positions, lanes, totalWidth } = computeLayout(pm.nodes, pm.edges);

  const flowNodes: Node<FlowNodeData>[] = pm.nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    initialWidth: (NODE_SIZE[n.kind] ?? NODE_SIZE.task).width,
    initialHeight: (NODE_SIZE[n.kind] ?? NODE_SIZE.task).height,
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

  const rawEdges: Edge[] = pm.edges.map((e, i) => ({
    id: `e-${e.source}-${e.target}-${i}`,
    source: e.source,
    target: e.target,
    label: e.label,
  }));

  const laneNodes = buildLaneNodes(lanes, totalWidth);
  const nodes: Node[] = [...laneNodes, ...flowNodes];
  const edges = routeEdges(flowNodes, rawEdges);
  return { nodes, edges };
}

export function handleForLabel(label?: string): string | null {
  if (label === "Sim") return "yes";
  if (label === "Não") return "no";
  return null;
}
