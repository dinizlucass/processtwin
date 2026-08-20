import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { activityTypeLabel, type FlowNodeData } from "@/lib/flow-types";

const badgeTone: Record<string, string> = {
  manual: "bg-warning-soft text-warning-text",
  semiautomatica: "bg-accent-soft text-accent",
  automatizada: "bg-success-soft text-success-strong",
};

export function TaskNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const isSub = data.kind === "subprocess";
  const systems = data.systems ?? [];

  const hasBadges = Boolean(data.activityType) || Boolean(data.usesAI) || isSub;

  return (
    <div
      className={`relative flex h-[72px] w-44 flex-col justify-center gap-1 overflow-hidden rounded-xl bg-surface px-3 py-1.5 ${
        selected
          ? "border-2 border-accent shadow-[0_0_0_4px_rgba(99,102,241,0.18)]"
          : isSub
            ? "border-2 border-slate-300"
            : "border border-border"
      } shadow-sm`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />

      {hasBadges && (
        <div className="flex items-center gap-1">
          {data.activityType && (
            <span className={`rounded px-1 py-0.5 text-[8.5px] font-bold ${badgeTone[data.activityType]}`}>
              {activityTypeLabel[data.activityType]}
            </span>
          )}
          {data.usesAI && (
            <span className="rounded bg-accent-soft px-1 py-0.5 text-[8.5px] font-bold text-accent">IA</span>
          )}
          {isSub && <span className="ml-auto text-[11px] font-bold text-slate-400">⊞</span>}
        </div>
      )}

      {/* rótulo: no máximo 2 linhas, sem quebrar no meio da palavra */}
      <span
        className="line-clamp-2 text-[12px] leading-[1.18] font-bold break-words text-slate-800"
        title={data.label}
      >
        {data.label}
      </span>

      {systems.length > 0 && (
        <div className="flex flex-nowrap gap-0.5 overflow-hidden">
          {systems.slice(0, 2).map((s) => (
            <span key={s} className="truncate rounded bg-page px-1 py-0.5 text-[8.5px] font-semibold text-slate-500">
              {s}
            </span>
          ))}
          {systems.length > 2 && (
            <span className="flex-none rounded bg-page px-1 py-0.5 text-[8.5px] font-semibold text-slate-400">
              +{systems.length - 2}
            </span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
      {/* base: usada por arestas de retorno (loop) — invisível */}
      <Handle type="source" position={Position.Bottom} id="b" className="!h-1 !w-1 !border-0 !bg-transparent" />
      <Handle type="target" position={Position.Bottom} id="b" className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
  );
}
