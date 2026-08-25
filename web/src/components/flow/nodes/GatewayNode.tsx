import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/flow-types";

const SYMBOL: Record<string, string> = {
  decision: "✕",
  gateway_parallel: "+",
  gateway_inclusive: "○",
};

export function GatewayNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const symbol = SYMBOL[data.kind] ?? "✕";

  return (
    <div className="relative h-16 w-16">
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      <div
        className={`absolute inset-2 rounded-[8px] bg-[#fffdf6] shadow-sm ${
          selected ? "border-2 border-accent shadow-[0_0_0_4px_rgba(99,102,241,0.18)]" : "border-2 border-amber-500"
        }`}
        style={{ transform: "rotate(45deg)" }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[22px] leading-none font-extrabold text-amber-600">
        {symbol}
      </div>
      {data.label && (
        <div
          className="pointer-events-none absolute -bottom-6 left-1/2 w-[130px] -translate-x-1/2 line-clamp-2 text-center text-[10.5px] leading-tight font-bold text-slate-500"
          title={data.label}
        >
          {data.label}
        </div>
      )}
      <Handle type="source" position={Position.Top} id="yes" className="!bg-success" />
      <Handle type="source" position={Position.Bottom} id="no" className="!bg-danger" />
      <Handle type="source" position={Position.Right} id="out" className="!bg-slate-400" />
    </div>
  );
}
