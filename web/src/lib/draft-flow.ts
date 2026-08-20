import type { Edge, Node } from "@xyflow/react";
import { NODE_SIZE, type ActivityType, type FlowNodeData, type NodeKind } from "@/lib/flow-types";
import {
  computeLayout,
  deriveLaneNodes,
  routeEdges,
  type DraftEdge,
  type DraftNode,
  type PreMapping,
} from "@/lib/premapping";
import { reflowLanes } from "@/lib/lanes";

/**
 * Converte o pré-mapeamento da IA para o formato editável do ModelingCanvas —
 * o MESMO caminho que o getProcessFlow usa ao abrir um processo salvo, só que a
 * partir do rascunho em memória: layout por longest-path, arestas roteadas por
 * geometria e raias derivadas dos atores (compatíveis com o reflowLanes).
 */
export function preMappingToEditorFlow(pm: PreMapping): { nodes: Node[]; edges: Edge[] } {
  const { positions } = computeLayout(pm.nodes, pm.edges);

  const contentNodes: Node<FlowNodeData>[] = pm.nodes.map((n) => ({
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

  const edges = routeEdges(contentNodes, rawEdges);
  const laneNodes = deriveLaneNodes(contentNodes);
  const nodes = reflowLanes([...laneNodes, ...contentNodes]);
  return { nodes, edges };
}

const KIND_SET = new Set<NodeKind>(["start", "end", "task", "decision"]);

/**
 * Converte o fluxo ATUALMENTE em tela (nós/arestas de conteúdo do editor) de
 * volta para o formato PreMapping da IA, reaproveitando process/systems/
 * recomendações do rascunho base. É isso que o ajuste da IA recebe como "estado
 * atual" — assim ela mexe no que está na tela, inclusive edições manuais.
 */
export function editorFlowToPreMapping(
  contentNodes: { id: string; data: FlowNodeData }[],
  contentEdges: { source: string; target: string; label?: unknown }[],
  base: PreMapping,
): PreMapping {
  const nodes: DraftNode[] = contentNodes
    .filter((n) => KIND_SET.has(n.data?.kind as NodeKind))
    .map((n) => ({
      id: n.id,
      kind: n.data.kind as NodeKind,
      label: n.data.label ?? "Etapa",
      actor: n.data.actor || undefined,
      activityType: (n.data.activityType || undefined) as ActivityType | undefined,
      systems: n.data.systems && n.data.systems.length ? n.data.systems : undefined,
    }));

  const edges: DraftEdge[] = contentEdges.map((e) => ({
    source: e.source,
    target: e.target,
    label: typeof e.label === "string" && e.label.trim() ? e.label : undefined,
  }));

  return { process: base.process, systems: base.systems, recommendations: base.recommendations, nodes, edges };
}
