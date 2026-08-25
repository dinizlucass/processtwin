import type { Node, NodeProps } from "@xyflow/react";
import type { LaneNodeData } from "@/lib/premapping";

// Cor de acento por raia (barrinha fina no cabeçalho identifica o ator).
const ACCENTS = ["#6366f1", "#0d9488", "#d97706", "#db2777", "#475569"];

const GRID = "#c7d0dc"; // linhas da grade (moldura + divisórias) — visíveis, sóbrias
const HEADER_BG = "#eef2f7"; // célula de cabeçalho, distinta do corpo branco

// Raia no padrão BPMN 2.0: corpo branco dentro de uma GRADE com moldura e
// divisórias sólidas, e uma célula de cabeçalho à esquerda com o rótulo do ator.
export function LaneNode({ data, selected }: NodeProps<Node<LaneNodeData>>) {
  const accent = ACCENTS[((data.tone % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
  const line = selected ? accent : GRID;

  return (
    <div className="pointer-events-none relative" style={{ width: data.width, height: data.height }}>
      {/* corpo branco com moldura/divisórias sólidas (formam a grade da pool) */}
      <div
        className="absolute inset-0"
        style={{
          background: "#ffffff",
          border: `1.5px solid ${line}`,
          boxShadow: selected ? `inset 0 0 0 1px ${accent}` : undefined,
        }}
      />
      {/* célula de cabeçalho (fina) — ÚNICA parte clicável (seleciona a raia) */}
      <div
        className="pointer-events-auto absolute inset-y-0 left-0 flex cursor-pointer items-center justify-center"
        style={{ width: data.labelWidth, background: HEADER_BG, borderRight: `1.5px solid ${line}` }}
        title="Clique para editar a raia"
      >
        <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />
        <span
          className="px-0.5 text-[10px] font-bold tracking-[.06em] text-slate-700 uppercase"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: data.height - 20, overflow: "hidden" }}
        >
          {data.label}
        </span>
      </div>
    </div>
  );
}
