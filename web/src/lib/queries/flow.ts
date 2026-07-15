import "server-only";
import type { Node, Edge } from "@xyflow/react";
import { supabaseAdmin } from "@/lib/supabase/server";
import { NODE_SIZE, type FlowNodeData } from "@/lib/flow-types";

interface FlowNodeRow {
  node_id: string;
  kind: FlowNodeData["kind"];
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

  const nodes: Node<FlowNodeData>[] = (nodeRows as FlowNodeRow[]).map((r) => {
    const attrs = (r.attributes ?? {}) as Partial<FlowNodeData>;
    const size = NODE_SIZE[r.kind] ?? NODE_SIZE.task;
    return {
      id: r.node_id,
      type: r.kind,
      position: { x: r.pos_x, y: r.pos_y },
      initialWidth: size.width,
      initialHeight: size.height,
      data: {
        kind: r.kind,
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

  const edges: Edge[] = (edgeRows as FlowEdgeRow[]).map((r) => ({
    id: r.edge_id,
    source: r.source_id,
    target: r.target_id,
    sourceHandle: r.source_handle ?? undefined,
    type: "smoothstep",
    label: r.label ?? undefined,
    labelStyle: r.label === "Sim" ? { fill: "#059669", fontWeight: 700, fontSize: 11 } : r.label === "Não" ? { fill: "#dc2626", fontWeight: 700, fontSize: 11 } : undefined,
    style: r.label === "Não" ? { stroke: "#94a3b8", strokeDasharray: "5 4" } : { stroke: "#94a3b8" },
  }));

  return { processId: process.id as string, name: process.name as string, version: process.version as number, nodes, edges };
}
