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
        className={`absolute inset-2 rounded-md border bg-warning-soft ${
          selected ? "border-2 border-accent shadow-[0_0_0_4px_rgba(99,102,241,0.18)]" : "border-warning"
        }`}
        style={{ transform: "rotate(45deg)" }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[16px] font-bold text-warning-strong">
        {symbol}
      </div>
      {data.label && (
        <div className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-warning-text">
          {data.label}
        </div>
      )}
      <Handle type="source" position={Position.Top} id="yes" className="!bg-success" />
      <Handle type="source" position={Position.Bottom} id="no" className="!bg-danger" />
      <Handle type="source" position={Position.Right} id="out" className="!bg-slate-400" />
    </div>
  );
}
