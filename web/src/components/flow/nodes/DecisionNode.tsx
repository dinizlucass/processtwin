import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/flow-types";

export function DecisionNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className="relative h-16 w-16">
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      <div
        className={`absolute inset-2 rounded-md border bg-warning-soft ${
          selected ? "border-2 border-accent" : "border-warning"
        }`}
        style={{ transform: "rotate(45deg)" }}
      />
      <div className="absolute inset-0 flex items-center justify-center text-center text-[9.5px] leading-tight font-bold text-warning-text">
        {data.label}
      </div>
      <Handle type="source" position={Position.Top} id="yes" className="!bg-success" />
      <Handle type="source" position={Position.Bottom} id="no" className="!bg-danger" />
    </div>
  );
}
