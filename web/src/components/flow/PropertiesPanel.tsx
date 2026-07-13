"use client";

import { useState } from "react";
import type { Node } from "@xyflow/react";
import { alertFrequencyOptions, activityTypeLabel, type ActivityType, type FlowNodeData } from "@/lib/flow-types";

const kindLabel: Record<string, string> = {
  start: "Evento de Início",
  end: "Evento de Fim",
  task: "Tarefa",
  decision: "Gateway de Decisão",
};

export function PropertiesPanel({
  node,
  onChange,
  onSave,
}: {
  node: Node<FlowNodeData> | null;
  onChange: (patch: Partial<FlowNodeData>) => void;
  onSave: () => void;
}) {
  const [tagDraft, setTagDraft] = useState("");

  if (!node) {
    return (
      <div className="flex w-[280px] flex-none flex-col items-center justify-center gap-2 border-l border-border bg-surface px-5 py-6 text-center text-[12.5px] text-muted">
        Selecione um elemento no canvas para editar suas propriedades.
      </div>
    );
  }

  const data = node.data;
  const isTask = data.kind === "task";

  return (
    <div className="flex w-[280px] flex-none flex-col gap-4 overflow-auto border-l border-border bg-surface px-5 py-5.5">
      <div>
        <div className="text-[10.5px] font-bold tracking-[.08em] text-slate-400 uppercase">Propriedades</div>
        <div className="mt-1.5 text-[15px] font-bold">{data.label}</div>
        <div className="mt-0.5 text-[11.5px] text-muted">{kindLabel[data.kind]}</div>
      </div>

      {isTask && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-muted">Tipo de atividade</label>
          <select
            value={data.activityType ?? "manual"}
            onChange={(e) => onChange({ activityType: e.target.value as ActivityType })}
            className="rounded-[9px] border border-border bg-page px-3 py-2 text-[12.5px] font-semibold"
          >
            {(Object.keys(activityTypeLabel) as ActivityType[]).map((t) => (
              <option key={t} value={t}>
                {activityTypeLabel[t]}
              </option>
            ))}
          </select>
        </div>
      )}

      {data.kind !== "start" && data.kind !== "end" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-muted">Responsável</label>
          <input
            value={data.actor ?? ""}
            onChange={(e) => onChange({ actor: e.target.value })}
            className="rounded-[9px] border border-border bg-page px-3 py-2 text-[12.5px] font-semibold outline-none focus:border-indigo-400"
            placeholder="Nome ou cargo..."
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold text-muted">Alerta de atualização</label>
        <select
          value={data.alertFrequency ?? "Sem alerta"}
          onChange={(e) => onChange({ alertFrequency: e.target.value })}
          className="cursor-pointer rounded-[9px] border border-border bg-page px-3 py-2 text-[12.5px] font-semibold hover:border-indigo-300"
        >
          {alertFrequencyOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-bold text-muted">Tags personalizadas</label>
        <div className="flex flex-wrap gap-1.5">
          {(data.tags ?? []).map((tag) => (
            <span
              key={tag}
              onClick={() => onChange({ tags: (data.tags ?? []).filter((t) => t !== tag) })}
              className="cursor-pointer rounded-full border border-accent-soft-border bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent"
              title="Clique para remover"
            >
              {tag}
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tagDraft.trim()) {
                onChange({ tags: [...(data.tags ?? []), tagDraft.trim()] });
                setTagDraft("");
              }
            }}
            placeholder="+ Tag"
            className="w-20 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-bold text-muted outline-none focus:border-indigo-400"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-[10px] bg-page p-3">
        <div>
          <div className="text-[12px] font-bold">Usa IA nesta etapa</div>
          <div className="text-[10.5px] text-slate-400">Triagem automática</div>
        </div>
        <button
          onClick={() => onChange({ usesAI: !data.usesAI })}
          className={`relative h-5 w-9 flex-none rounded-full transition-colors ${data.usesAI ? "bg-accent" : "bg-slate-300"}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
              data.usesAI ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex-1" />
      <button onClick={onSave} className="rounded-[10px] bg-accent py-2.5 text-[13px] font-semibold text-white hover:bg-accent-hover">
        Salvar alterações
      </button>
    </div>
  );
}
