import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/flow-types";

export function DataNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div
      className={`relative flex h-[70px] w-[124px] flex-col justify-center gap-0.5 bg-surface px-3 py-2 shadow-sm ${
        selected ? "border-2 border-accent shadow-[0_0_0_4px_rgba(99,102,241,0.18)]" : "border border-border"
      }`}
      style={{ clipPath: "polygon(0 0, 78% 0, 100% 22%, 100% 100%, 0 100%)" }}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      <span className="text-[8.5px] font-bold tracking-wide text-slate-400 uppercase">Dados</span>
      <span className="text-[11.5px] leading-tight font-bold text-slate-700">{data.label}</span>
      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
      <Handle type="source" position={Position.Bottom} id="b" className="!h-1 !w-1 !border-0 !bg-transparent" />
      <Handle type="target" position={Position.Bottom} id="b" className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
  );
}
