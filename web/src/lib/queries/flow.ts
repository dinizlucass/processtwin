import "server-only";
import type { Node, Edge } from "@xyflow/react";
import { supabaseAdmin } from "@/lib/supabase/server";
import { NODE_SIZE, type FlowNodeData } from "@/lib/flow-types";
import { deriveLaneNodes, routeEdges } from "@/lib/premapping";
import { laneNodesFromRows, reflowLanes, type PersistedLane } from "@/lib/lanes";

interface FlowNodeRow {
  node_id: string;
  kind: string; // pode ser um NodeKind ou "lane"
  label: string;
  actor: string | null;
  activity_type: FlowNodeData["activityType"] | null;
  alert_frequency: string | null;
  tags: string[] | null;
  uses_ai: boolean;
  pos_x: number;
  pos_y: number;
  attributes: Record<string, unknown> | null;
}

interface FlowEdgeRow {
  edge_id: string;
  source_id: string;
  target_id: string;
  source_handle: string | null;
  label: string | null;
}

export async function getProcessFlow(processId: string) {
  const supabase = supabaseAdmin();

  const { data: process, error: processError } = await supabase
    .from("process")
    .select("id,name,version")
    .eq("id", processId)
    .single();
  if (processError) throw new Error(`Processo ${processId} não encontrado: ${processError.message}`);

  const [{ data: nodeRows, error: nodesError }, { data: edgeRows, error: edgesError }] = await Promise.all([
    supabase.from("flow_node").select("*").eq("process_id", process.id),
    supabase.from("flow_edge").select("*").eq("process_id", process.id),
  ]);
  if (nodesError) throw new Error(`Falha ao carregar nós: ${nodesError.message}`);
  if (edgesError) throw new Error(`Falha ao carregar conexões: ${edgesError.message}`);

  const allRows = (nodeRows as FlowNodeRow[]) ?? [];
  const laneRows = allRows.filter((r) => r.kind === "lane");
  const contentRows = allRows.filter((r) => r.kind !== "lane");

  const nodes: Node<FlowNodeData>[] = contentRows.map((r) => {
    const attrs = (r.attributes ?? {}) as Partial<FlowNodeData>;
    const kind = r.kind as FlowNodeData["kind"];
    const size = NODE_SIZE[kind] ?? NODE_SIZE.task;
    return {
      id: r.node_id,
      type: kind,
      position: { x: r.pos_x, y: r.pos_y },
      initialWidth: size.width,
      initialHeight: size.height,
      data: {
        kind,
        label: r.label,
        actor: r.actor ?? undefined,
        activityType: r.activity_type ?? undefined,
        alertFrequency: r.alert_frequency ?? undefined,
        tags: r.tags ?? [],
        usesAI: r.uses_ai,
        // atributos ricos (área, descrição, sistemas, SLA, controles, etc.)
        area: attrs.area,
        description: attrs.description,
        systems: attrs.systems ?? [],
        inputs: attrs.inputs,
        outputs: attrs.outputs,
        sla: attrs.sla,
        cost: attrs.cost,
        controls: attrs.controls,
        exceptions: attrs.exceptions,
        kpi: attrs.kpi,
        documentation: attrs.documentation,
      },
    };
  });

  const rawEdges: Edge[] = (edgeRows as FlowEdgeRow[]).map((r) => ({
    id: r.edge_id,
    source: r.source_id,
    target: r.target_id,
    label: r.label ?? undefined,
  }));
  // roteia por geometria (handles/estilo) para bater com o preview da IA
  const edges = routeEdges(nodes, rawEdges);

  // raias: usa as persistidas (kind='lane') se houver; senão deriva pelos atores
  const laneNodes =
    laneRows.length > 0
      ? laneNodesFromRows(
          laneRows.map((r) => ({ node_id: r.node_id, label: r.label, pos_y: r.pos_y, attributes: r.attributes } as PersistedLane)),
        )
      : deriveLaneNodes(nodes);

  return {
    processId: process.id as string,
    name: process.name as string,
    version: process.version as number,
    nodes: reflowLanes([...laneNodes, ...nodes]) as Node[],
    edges,
  };
}
