"use client";

import { NODE_META, PALETTE_GROUPS, type NodeKind } from "@/lib/flow-types";

function Swatch({ kind }: { kind: NodeKind }) {
  switch (kind) {
    case "start":
      return <span className="h-4 w-4 flex-none rounded-full border-2 border-success" />;
    case "end":
      return <span className="h-4 w-4 flex-none rounded-full border-[3px] border-danger" />;
    case "intermediate":
      return <span className="h-4 w-4 flex-none rounded-full border-2 border-warning-strong" />;
    case "task":
      return <span className="h-3.5 w-5 flex-none rounded border-2 border-accent-2" />;
    case "subprocess":
      return <span className="h-3.5 w-5 flex-none rounded border-2 border-slate-400" />;
    case "decision":
      return <span className="flex h-4 w-4 flex-none rotate-45 items-center justify-center border-2 border-warning-strong text-[7px]" />;
    case "gateway_parallel":
      return (
        <span className="flex h-4 w-4 flex-none rotate-45 items-center justify-center border-2 border-warning-strong">
          <span className="-rotate-45 text-[9px] leading-none font-bold text-warning-strong">+</span>
        </span>
      );
    case "gateway_inclusive":
      return (
        <span className="flex h-4 w-4 flex-none rotate-45 items-center justify-center border-2 border-warning-strong">
          <span className="-rotate-45 text-[8px] leading-none font-bold text-warning-strong">○</span>
        </span>
      );
    case "data":
      return <span className="h-4 w-3.5 flex-none border-2 border-slate-400" style={{ clipPath: "polygon(0 0, 75% 0, 100% 25%, 100% 100%, 0 100%)" }} />;
    case "annotation":
      return <span className="h-4 w-3.5 flex-none border-l-2 border-slate-400" />;
    default:
      return null;
  }
}

export function Palette() {
  return (
    <div className="flex w-[196px] flex-none flex-col gap-3 overflow-auto border-r border-border bg-surface px-3.5 py-5">
      <div className="px-1 text-[10.5px] font-bold tracking-[.08em] text-slate-400 uppercase">Elementos</div>

      {PALETTE_GROUPS.map((group) => (
        <div key={group} className="flex flex-col gap-1.5">
          <div className="px-1 text-[10px] font-bold tracking-[.06em] text-slate-400 uppercase">{group}</div>
          {Object.values(NODE_META)
            .filter((m) => m.group === group)
            .map((m) => (
              <div
                key={m.kind}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-processtwin-node", m.kind);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="flex cursor-grab items-center gap-2.5 rounded-[9px] border border-border bg-page px-2.5 py-2 text-[12px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-accent-soft"
              >
                <Swatch kind={m.kind} />
                {m.label}
              </div>
            ))}
        </div>
      ))}

      <div className="mt-1 rounded-[10px] bg-page p-2.5 text-[10.5px] leading-relaxed text-slate-400">
        Arraste um elemento para o canvas. Clique para editar; <kbd className="rounded border border-border bg-surface px-1">Del</kbd> exclui o selecionado.
      </div>
    </div>
  );
}
