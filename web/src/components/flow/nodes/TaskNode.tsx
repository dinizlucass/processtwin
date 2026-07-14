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

  return (
    <div
      className={`relative flex min-h-[66px] w-44 flex-col justify-center gap-0.5 rounded-xl bg-surface px-3 py-2 ${
        selected
          ? "border-2 border-accent shadow-[0_0_0_4px_rgba(99,102,241,0.18)]"
          : isSub
            ? "border-2 border-slate-300"
            : "border border-border"
      } shadow-sm`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />

      <div className="flex items-center gap-1.5">
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

      <span className="text-[12.5px] leading-tight font-bold text-slate-800">{data.label}</span>
      {data.actor && <span className="text-[10px] font-semibold text-muted">{data.actor}</span>}

      {systems.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-0.5">
          {systems.slice(0, 3).map((s) => (
            <span key={s} className="rounded bg-page px-1 py-0.5 text-[8.5px] font-semibold text-slate-500">
              {s}
            </span>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
    </div>
  );
}
