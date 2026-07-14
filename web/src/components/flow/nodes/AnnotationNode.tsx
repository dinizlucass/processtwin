import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/flow-types";

export function AnnotationNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div
      className={`max-w-[200px] border-l-2 bg-amber-50/70 py-1.5 pr-2 pl-2.5 text-[11px] leading-snug text-slate-600 ${
        selected ? "border-l-accent shadow-[0_0_0_4px_rgba(99,102,241,0.15)]" : "border-l-slate-400"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-300" />
      {data.label}
    </div>
  );
}
