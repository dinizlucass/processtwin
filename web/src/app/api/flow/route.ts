import { supabaseAdmin } from "@/lib/supabase/server";
import { ATTRIBUTE_KEYS, type FlowNodeData } from "@/lib/flow-types";

interface SavePayload {
  processId: string;
  nodes: { id: string; type: string; position: { x: number; y: number }; data: FlowNodeData }[];
  edges: { id: string; source: string; target: string; sourceHandle?: string; label?: string }[];
}

function extractAttributes(data: FlowNodeData): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const key of ATTRIBUTE_KEYS) {
    const value = data[key];
    if (value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0)) {
      attrs[key] = value;
    }
  }
  return attrs;
}

export async function POST(req: Request) {
  const { processId, nodes, edges } = (await req.json()) as SavePayload;
  const supabase = supabaseAdmin();

  const { error: delNodesErr } = await supabase.from("flow_node").delete().eq("process_id", processId);
  if (delNodesErr) return Response.json({ error: delNodesErr.message }, { status: 500 });

  const { error: delEdgesErr } = await supabase.from("flow_edge").delete().eq("process_id", processId);
  if (delEdgesErr) return Response.json({ error: delEdgesErr.message }, { status: 500 });

  if (nodes.length > 0) {
    const nodeRows = nodes.map((n) => ({
      process_id: processId,
      node_id: n.id,
      kind: n.data.kind,
      label: n.data.label,
      actor: n.data.actor ?? null,
      activity_type: n.data.kind === "task" || n.data.kind === "subprocess" ? n.data.activityType ?? null : null,
      alert_frequency: n.data.alertFrequency ?? null,
      tags: n.data.tags ?? [],
      uses_ai: n.data.usesAI ?? false,
      pos_x: n.position.x,
      pos_y: n.position.y,
      attributes: extractAttributes(n.data),
    }));
    const { error } = await supabase.from("flow_node").insert(nodeRows);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  if (edges.length > 0) {
    const edgeRows = edges.map((e) => ({
      process_id: processId,
      edge_id: e.id,
      source_id: e.source,
      target_id: e.target,
      source_handle: e.sourceHandle ?? null,
      label: e.label ?? null,
    }));
    const { error } = await supabase.from("flow_edge").insert(edgeRows);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // increment version via a read-then-write (fine at this scale, no concurrent editors yet)
  const { data: current } = await supabase.from("process").select("version").eq("id", processId).single();
  const nextVersion = (current?.version ?? 1) + 1;
  const { error: bumpErr } = await supabase.from("process").update({ version: nextVersion }).eq("id", processId);
  if (bumpErr) return Response.json({ error: bumpErr.message }, { status: 500 });

  return Response.json({ version: nextVersion });
}
