import type { Node } from "@xyflow/react";
import { LANE_LABEL_W, type LaneNodeData } from "@/lib/premapping";
import { NODE_SIZE, type FlowNodeData, type NodeKind } from "@/lib/flow-types";

// Geometria das raias no modelador manual.
export const DEFAULT_LANE_HEIGHT = 150;
export const MIN_LANE_HEIGHT = 90;
export const LANE_HEIGHT_STEP = 30;
const MIN_LANE_WIDTH = 960;
const CONTENT_RIGHT_PAD = 90;
export const LANE_COLOR_COUNT = 5;

let laneSeq = 1;
export function nextLaneId(): string {
  return `lane-${Date.now().toString(36)}-${laneSeq++}`;
}

export function isLane(n: Node): boolean {
  return n.type === "lane";
}

function nodeSize(n: Node): { w: number; h: number } {
  const size = NODE_SIZE[(n.data as FlowNodeData)?.kind as NodeKind] ?? NODE_SIZE.task;
  return {
    w: (n.width ?? n.initialWidth ?? size.width) as number,
    h: (n.height ?? n.initialHeight ?? size.height) as number,
  };
}

/** Largura que as bandas devem ter para cobrir todo o conteúdo. */
export function contentWidth(nodes: Node[]): number {
  let max = LANE_LABEL_W + 320;
  for (const n of nodes) {
    if (isLane(n)) continue;
    max = Math.max(max, n.position.x + nodeSize(n).w);
  }
  return Math.max(MIN_LANE_WIDTH, max + CONTENT_RIGHT_PAD);
}

/**
 * Recalcula posição/tamanho/ordem das raias E arrasta o conteúdo junto: quando
 * uma raia muda de y (nova raia, reordenar, redimensionar), as tarefas dela se
 * deslocam pelo mesmo delta, mantendo bandas e conteúdo sempre alinhados.
 */
export function reflowLanes(nodes: Node[]): Node[] {
  const lanes = nodes
    .filter(isLane)
    .sort((a, b) => ((a.data as LaneNodeData).order ?? 0) - ((b.data as LaneNodeData).order ?? 0));
  if (lanes.length === 0) return nodes;
  const width = contentWidth(nodes);

  // geometria antiga (para calcular o deslocamento) e nova (empilhada a partir de 0)
  const oldGeo = new Map<string, { y: number; h: number }>();
  const newGeo = new Map<string, { y: number; h: number; order: number }>();
  let y = 0;
  lanes.forEach((lane, i) => {
    const d = lane.data as LaneNodeData;
    const h = (d.height ?? DEFAULT_LANE_HEIGHT) as number;
    oldGeo.set(lane.id, { y: lane.position.y, h: (lane.height ?? h) as number });
    newGeo.set(lane.id, { y, h, order: i });
    y += h;
  });

  // a qual raia um nó de conteúdo pertence: 1º pelo ator; senão pela banda antiga
  const laneIdForContent = (n: Node): string | undefined => {
    const actor = (n.data as FlowNodeData)?.actor?.trim();
    if (actor) {
      const byActor = lanes.find((l) => (l.data as LaneNodeData).label === actor);
      if (byActor) return byActor.id;
    }
    const cy = n.position.y + nodeSize(n).h / 2;
    const band = lanes.find((l) => {
      const g = oldGeo.get(l.id)!;
      return cy >= g.y && cy < g.y + g.h;
    });
    return band?.id;
  };

  return nodes.map((n) => {
    if (isLane(n)) {
      const g = newGeo.get(n.id);
      if (!g) return n;
      const d = n.data as LaneNodeData;
      return {
        ...n,
        position: { x: 0, y: g.y },
        width,
        height: g.h,
        draggable: false,
        selectable: true,
        connectable: false,
        deletable: false,
        zIndex: -1,
        data: { ...d, width, height: g.h, labelWidth: LANE_LABEL_W, order: g.order },
      };
    }
    // conteúdo: desloca pelo mesmo delta que sua raia se moveu
    const lid = laneIdForContent(n);
    if (!lid) return n;
    const o = oldGeo.get(lid)!;
    const g = newGeo.get(lid)!;
    const dy = g.y - o.y;
    return dy === 0 ? n : { ...n, position: { x: n.position.x, y: n.position.y + dy } };
  });
}

/** Retorna a raia cuja banda contém a coordenada vertical (centro do nó). */
export function laneBandAt(centerY: number, nodes: Node[]): Node | null {
  for (const n of nodes) {
    if (!isLane(n)) continue;
    const top = n.position.y;
    const h = (n.height ?? (n.data as LaneNodeData).height ?? DEFAULT_LANE_HEIGHT) as number;
    if (centerY >= top && centerY < top + h) return n;
  }
  return null;
}

/** Cria uma nova raia (será posicionada pelo reflow). O id deve vir de fora do
 * updater do setState (StrictMode chama o updater 2x — geração de id ali causa drift). */
export function makeLane(label: string, colorIndex: number, order: number, height = DEFAULT_LANE_HEIGHT, id = nextLaneId()): Node<LaneNodeData> {
  return {
    id,
    type: "lane",
    position: { x: 0, y: 0 },
    width: MIN_LANE_WIDTH,
    height,
    draggable: false,
    selectable: true,
    connectable: false,
    deletable: false,
    focusable: false,
    zIndex: -1,
    data: { label, width: MIN_LANE_WIDTH, height, labelWidth: LANE_LABEL_W, tone: colorIndex, order },
  };
}

/** Constrói os nós de raia a partir de linhas persistidas (kind='lane'). */
export interface PersistedLane {
  node_id: string;
  label: string;
  pos_y: number;
  attributes: Record<string, unknown> | null;
}
export function laneNodesFromRows(rows: PersistedLane[]): Node<LaneNodeData>[] {
  return rows
    .map((r, i) => {
      const a = r.attributes ?? {};
      const height = Number(a.height) || DEFAULT_LANE_HEIGHT;
      const order = a.order !== undefined ? Number(a.order) : i;
      const tone = a.colorIndex !== undefined ? Number(a.colorIndex) : i;
      // posição y persistida — necessária para o reflow não deslocar o conteúdo
      return makeLaneFrom(r.node_id, r.label, tone, order, height, r.pos_y || 0);
    })
    .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
}
function makeLaneFrom(id: string, label: string, colorIndex: number, order: number, height: number, y: number): Node<LaneNodeData> {
  return {
    id,
    type: "lane",
    position: { x: 0, y },
    width: MIN_LANE_WIDTH,
    height,
    draggable: false,
    selectable: true,
    connectable: false,
    deletable: false,
    focusable: false,
    zIndex: -1,
    data: { label, width: MIN_LANE_WIDTH, height, labelWidth: LANE_LABEL_W, tone: colorIndex, order },
  };
}
