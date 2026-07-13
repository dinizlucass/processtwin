"use client";

import type { NodeKind } from "@/lib/flow-types";

const ITEMS: { kind: NodeKind; label: string; swatch: React.ReactNode }[] = [
  {
    kind: "task",
    label: "Tarefa",
    swatch: <span className="h-3.5 w-5 flex-none rounded border-2 border-accent-2" />,
  },
  {
    kind: "decision",
    label: "Decisão",
    swatch: <span className="m-[3px] h-3.5 w-3.5 flex-none rotate-45 border-2 border-warning-strong" />,
  },
  {
    kind: "start",
    label: "Início",
    swatch: <span className="m-[3px] h-3.5 w-3.5 flex-none rounded-full border-2 border-success" />,
  },
  {
    kind: "end",
    label: "Fim",
    swatch: <span className="m-[3px] h-3.5 w-3.5 flex-none rounded-full border-[3px] border-danger" />,
  },
];

export function Palette() {
  return (
    <div className="flex w-[190px] flex-none flex-col gap-2 border-r border-border bg-surface px-3.5 py-5">
      <div className="px-1 pb-1.5 text-[10.5px] font-bold tracking-[.08em] text-slate-400 uppercase">Elementos</div>
      {ITEMS.map((item) => (
        <div
          key={item.kind}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-processtwin-node", item.kind);
            e.dataTransfer.effectAllowed = "move";
          }}
          className="flex cursor-grab items-center gap-2.5 rounded-[10px] border border-border bg-page px-3 py-2.5 text-[12.5px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-accent-soft"
        >
          {item.swatch}
          {item.label}
        </div>
      ))}
      <div className="mt-2.5 rounded-[10px] bg-page p-3 text-[11px] leading-relaxed text-slate-400">
        Arraste elementos para o canvas para montar o fluxo.
      </div>
    </div>
  );
}
