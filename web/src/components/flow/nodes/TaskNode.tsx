import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { activityTypeLabel, type FlowNodeData } from "@/lib/flow-types";

const badgeTone: Record<string, string> = {
  manual: "bg-warning-soft text-warning-text",
  semiautomatica: "bg-accent-soft text-accent",
  automatizada: "bg-success-soft text-success-strong",
};

export function TaskNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div
      className={`relative flex h-16 w-40 flex-col items-center justify-center gap-0.5 rounded-xl border bg-surface shadow-sm ${
        selected ? "border-2 border-accent shadow-[0_0_0_4px_rgba(99,102,241,0.18)]" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      {data.activityType && (
        <span
          className={`absolute -top-2.5 right-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${badgeTone[data.activityType]}`}
        >
          {activityTypeLabel[data.activityType]}
        </span>
      )}
      <span className="text-[12.5px] font-bold text-slate-800">{data.label}</span>
      {data.actor && <span className="text-[10px] font-semibold text-muted">{data.actor}</span>}
      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
    </div>
  );
}
