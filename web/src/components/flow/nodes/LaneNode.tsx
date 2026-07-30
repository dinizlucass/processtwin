import type { Node, NodeProps } from "@xyflow/react";
import type { LaneNodeData } from "@/lib/premapping";

// Paleta suave alternada para as faixas das raias
const TONES = [
  { band: "rgba(99,102,241,0.05)", label: "rgba(99,102,241,0.14)", text: "text-indigo-700", sel: "#6366f1" },
  { band: "rgba(20,184,166,0.055)", label: "rgba(20,184,166,0.15)", text: "text-teal-700", sel: "#0d9488" },
  { band: "rgba(245,158,11,0.055)", label: "rgba(245,158,11,0.16)", text: "text-amber-700", sel: "#d97706" },
  { band: "rgba(236,72,153,0.05)", label: "rgba(236,72,153,0.14)", text: "text-pink-700", sel: "#db2777" },
  { band: "rgba(100,116,139,0.07)", label: "rgba(100,116,139,0.16)", text: "text-slate-600", sel: "#475569" },
];

export function LaneNode({ data, selected }: NodeProps<Node<LaneNodeData>>) {
  const tone = TONES[((data.tone % TONES.length) + TONES.length) % TONES.length];

  return (
    <div className="pointer-events-none relative" style={{ width: data.width, height: data.height }}>
      {/* fundo da raia (não captura clique → pan e nós continuam acessíveis) */}
      <div
        className="absolute inset-0 border-y"
        style={{
          background: tone.band,
          borderColor: selected ? tone.sel : "rgba(148,163,184,0.55)",
          borderTopStyle: "dashed",
          borderBottomStyle: "dashed",
          boxShadow: selected ? `inset 0 0 0 2px ${tone.sel}55` : undefined,
        }}
      />
      {/* faixa de rótulo à esquerda — ÚNICA parte clicável (seleciona a raia) */}
      <div
        className="pointer-events-auto absolute inset-y-0 left-0 flex cursor-pointer flex-col items-center justify-center gap-1 border-r"
        style={{
          width: data.labelWidth,
          background: tone.label,
          borderColor: selected ? tone.sel : "rgba(148,163,184,0.55)",
          boxShadow: selected ? `inset 0 0 0 2px ${tone.sel}` : undefined,
        }}
        title="Clique para editar a raia"
      >
        <span
          className={`text-[11px] font-bold tracking-[.08em] uppercase ${tone.text}`}
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: data.height - 40 }}
        >
          {data.label}
        </span>
        <span className={`text-[8px] font-bold tracking-wide uppercase opacity-50 ${tone.text}`}>raia</span>
      </div>
    </div>
  );
}
