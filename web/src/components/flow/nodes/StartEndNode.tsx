import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/flow-types";

export function StartEndNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const isStart = data.kind === "start";
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-full text-[9px] font-bold ${
        isStart ? "bg-success-soft text-success-strong" : "bg-danger-soft text-danger-strong"
      } ${selected ? (isStart ? "border-2 border-success-strong" : "border-[3px] border-danger-strong") : isStart ? "border-2 border-emerald-400" : "border-[3px] border-red-400"}`}
    >
      {!isStart && <Handle type="target" position={Position.Left} className="!bg-slate-400" />}
      {data.label.toUpperCase()}
      {isStart && <Handle type="source" position={Position.Right} className="!bg-slate-400" />}
    </div>
  );
}
