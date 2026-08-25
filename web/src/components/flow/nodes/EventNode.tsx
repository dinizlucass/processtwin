import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/flow-types";

// Eventos BPMN: círculo LIMPO, rótulo por fora (embaixo). O raiz tem o tamanho
// EXATO do círculo (48px) e o rótulo é ABSOLUTO — assim os handles das arestas
// ficam no centro do círculo (senão a linha sai torta) e o layout continua 48px.
export function EventNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const isStart = data.kind === "start";
  const isEnd = data.kind === "end";

  const ring = isStart
    ? "border-2 border-emerald-500"
    : isEnd
      ? "border-[3.5px] border-red-500"
      : "border-2 border-amber-500";

  const selClass = selected ? "!border-accent shadow-[0_0_0_4px_rgba(99,102,241,0.18)]" : "shadow-sm";

  return (
    <div className="relative h-12 w-12">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-surface ${ring} ${selClass}`}>
        {!isStart && <Handle type="target" position={Position.Left} className="!bg-slate-400" />}

        {isStart && (
          <span className="ml-[3px] h-0 w-0 border-t-[7px] border-b-[7px] border-l-[11px] border-t-transparent border-b-transparent border-l-emerald-500" />
        )}
        {isEnd && <span className="h-3.5 w-3.5 rounded-[3px] bg-red-500" />}
        {data.kind === "intermediate" && (
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-500 text-[8px] font-bold text-amber-600">
            EV
          </span>
        )}

        {!isEnd && <Handle type="source" position={Position.Right} className="!bg-slate-400" />}
        {!isEnd && <Handle type="source" position={Position.Bottom} id="b" className="!h-1 !w-1 !border-0 !bg-transparent" />}
        {!isStart && <Handle type="target" position={Position.Bottom} id="b" className="!h-1 !w-1 !border-0 !bg-transparent" />}
      </div>

      {data.label && (
        <span className="pointer-events-none absolute top-[calc(100%+3px)] left-1/2 w-[124px] -translate-x-1/2 text-center text-[10.5px] leading-tight font-semibold text-slate-500">
          {data.label}
        </span>
      )}
    </div>
  );
}
