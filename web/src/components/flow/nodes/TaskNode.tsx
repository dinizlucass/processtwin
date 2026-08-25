import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { activityTypeLabel, type ActivityType, type FlowNodeData } from "@/lib/flow-types";

// Faixa lateral e ponto coloridos por tipo de atividade (em vez de badge solto).
const STRIPE: Record<ActivityType, string> = {
  manual: "bg-amber-500",
  semiautomatica: "bg-indigo-500",
  automatizada: "bg-emerald-500",
};

export function TaskNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const isSub = data.kind === "subprocess";
  const systems = data.systems ?? [];
  const at = data.activityType;
  const hasKick = Boolean(at) || Boolean(data.usesAI) || isSub;

  return (
    <div
      className={`relative flex h-[72px] w-44 overflow-hidden rounded-xl bg-surface shadow-sm ${
        selected
          ? "border-2 border-accent shadow-[0_0_0_4px_rgba(99,102,241,0.18)]"
          : isSub
            ? "border-2 border-slate-300"
            : "border border-border"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />

      {/* faixa de cor por tipo */}
      <div className={`w-[4px] flex-none ${at ? STRIPE[at] : "bg-slate-300"}`} />

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2.5 py-1.5">
        {hasKick && (
          <div className="flex items-center gap-1.5">
            {at && (
              <>
                <span className={`h-1.5 w-1.5 flex-none rounded-full ${STRIPE[at]}`} />
                <span className="text-[8px] font-extrabold tracking-[.05em] text-slate-400 uppercase">
                  {activityTypeLabel[at]}
                </span>
              </>
            )}
            {data.usesAI && <span className="rounded bg-accent-soft px-1 py-0.5 text-[8px] font-bold text-accent">IA</span>}
            {isSub && <span className="ml-auto text-[11px] leading-none font-bold text-slate-400">⊞</span>}
          </div>
        )}

        <span
          className="line-clamp-2 text-[12.5px] leading-[1.15] font-bold break-words text-slate-800"
          title={data.label}
        >
          {data.label}
        </span>

        {systems.length > 0 && (
          <div className="flex flex-nowrap gap-1 overflow-hidden">
            {systems.slice(0, 2).map((s) => (
              <span key={s} className="truncate rounded-[5px] border border-border-soft bg-slate-50 px-1 py-0.5 text-[8px] font-semibold text-slate-500">
                {s}
              </span>
            ))}
            {systems.length > 2 && (
              <span className="flex-none rounded-[5px] bg-slate-50 px-1 py-0.5 text-[8px] font-semibold text-slate-400">
                +{systems.length - 2}
              </span>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
      <Handle type="source" position={Position.Bottom} id="b" className="!h-1 !w-1 !border-0 !bg-transparent" />
      <Handle type="target" position={Position.Bottom} id="b" className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
  );
}
