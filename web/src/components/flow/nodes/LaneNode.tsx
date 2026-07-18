import type { Node, NodeProps } from "@xyflow/react";
import type { LaneNodeData } from "@/lib/premapping";

// Paleta suave alternada para as faixas das raias
const TONES = [
  { band: "rgba(99,102,241,0.045)", label: "rgba(99,102,241,0.12)", text: "text-indigo-700" },
  { band: "rgba(20,184,166,0.05)", label: "rgba(20,184,166,0.13)", text: "text-teal-700" },
  { band: "rgba(245,158,11,0.05)", label: "rgba(245,158,11,0.14)", text: "text-amber-700" },
  { band: "rgba(236,72,153,0.045)", label: "rgba(236,72,153,0.12)", text: "text-pink-700" },
  { band: "rgba(100,116,139,0.06)", label: "rgba(100,116,139,0.14)", text: "text-slate-600" },
];

export function LaneNode({ data }: NodeProps<Node<LaneNodeData>>) {
  const tone = TONES[data.tone % TONES.length];

  return (
    <div className="pointer-events-none relative" style={{ width: data.width, height: data.height }}>
      {/* fundo da raia */}
      <div className="absolute inset-0 border-y border-dashed border-slate-300" style={{ background: tone.band }} />
      {/* faixa de rótulo à esquerda com o nome do ator (vertical) */}
      <div
        className="absolute inset-y-0 left-0 flex items-center justify-center border-r border-slate-300"
        style={{ width: data.labelWidth, background: tone.label }}
      >
        <span
          className={`text-[11px] font-bold tracking-[.08em] uppercase ${tone.text}`}
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: data.height - 24 }}
          title={data.label}
        >
          {data.label}
        </span>
      </div>
    </div>
  );
}
