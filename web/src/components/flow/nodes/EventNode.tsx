import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/flow-types";

export function EventNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const isStart = data.kind === "start";
  const isEnd = data.kind === "end";

  const ring = isStart
    ? "border-2 border-emerald-400 bg-success-soft text-success-strong"
    : isEnd
      ? "border-[3px] border-red-400 bg-danger-soft text-danger-strong"
      : "border-2 border-amber-400 bg-warning-soft text-warning-text";

  const selRing = selected
    ? isStart
      ? "!border-success-strong"
      : isEnd
        ? "!border-danger-strong"
        : "!border-warning-strong"
    : "";

  return (
    <div className="relative flex flex-col items-center">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${ring} ${selRing} ${selected ? "shadow-[0_0_0_4px_rgba(99,102,241,0.18)]" : ""}`}>
        {!isStart && <Handle type="target" position={Position.Left} className="!bg-slate-400" />}
        {data.kind === "intermediate" && (
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-current text-[8px] font-bold">
            EV
          </span>
        )}
        {isStart && <span className="text-[9px] font-bold">INÍCIO</span>}
        {isEnd && <span className="text-[9px] font-bold">FIM</span>}
        {!isEnd && <Handle type="source" position={Position.Right} className="!bg-slate-400" />}
        {!isEnd && <Handle type="source" position={Position.Bottom} id="b" className="!h-1 !w-1 !border-0 !bg-transparent" />}
        {!isStart && <Handle type="target" position={Position.Bottom} id="b" className="!h-1 !w-1 !border-0 !bg-transparent" />}
      </div>
      {data.kind === "intermediate" && data.label && (
        <span className="mt-1 max-w-[120px] text-center text-[10px] font-semibold text-slate-600">{data.label}</span>
      )}
    </div>
  );
}
