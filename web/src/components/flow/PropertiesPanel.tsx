"use client";

import { useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import {
  NODE_META,
  activityTypeLabel,
  alertFrequencyOptions,
  type ActivityType,
  type FlowNodeData,
} from "@/lib/flow-types";
import type { LaneNodeData } from "@/lib/premapping";
import { LANE_HEIGHT_STEP } from "@/lib/lanes";

// Cores das raias (espelham LaneNode) — usadas no seletor de cor
const LANE_SWATCHES = ["#6366f1", "#0d9488", "#d97706", "#db2777", "#475569"];

// ---------- Campos reutilizáveis ----------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-muted">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-[9px] border border-border bg-page px-3 py-2 text-[12.5px] outline-none focus:border-indigo-400";

function TextField({ label, value, onChange, placeholder }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
    </Field>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 2 }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <Field label={label}>
      <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className={`${inputCls} resize-none`} />
    </Field>
  );
}

function TagList({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="cursor-pointer rounded-full border border-accent-soft-border bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent"
            title="Clique para remover"
          >
            {v} ✕
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              if (!values.includes(draft.trim())) onChange([...values, draft.trim()]);
              setDraft("");
            }
          }}
          placeholder={placeholder}
          className="w-24 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-semibold outline-none focus:border-indigo-400"
        />
      </div>
    </Field>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 border-b border-border-soft pb-1 text-[10.5px] font-bold tracking-[.07em] text-slate-400 uppercase">{children}</div>;
}

// ---------- Painel de nó ----------

export function PropertiesPanel({
  node,
  edge,
  lane,
  laneCanMoveUp,
  laneCanMoveDown,
  onNodeChange,
  onEdgeChange,
  onLaneRename,
  onLaneColor,
  onLaneResize,
  onLaneMove,
  onLaneDelete,
  onDelete,
  onDuplicate,
  onSave,
  saveState,
}: {
  node: Node<FlowNodeData> | null;
  edge: Edge | null;
  lane: Node<LaneNodeData> | null;
  laneCanMoveUp: boolean;
  laneCanMoveDown: boolean;
  onNodeChange: (patch: Partial<FlowNodeData>) => void;
  onEdgeChange: (patch: Partial<Edge>) => void;
  onLaneRename: (v: string) => void;
  onLaneColor: (i: number) => void;
  onLaneResize: (delta: number) => void;
  onLaneMove: (dir: -1 | 1) => void;
  onLaneDelete: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSave: () => void;
  saveState: "idle" | "saving" | "saved" | "error";
}) {
  if (lane) {
    return (
      <PanelShell onSave={onSave} saveState={saveState}>
        <LaneEditor
          lane={lane}
          canMoveUp={laneCanMoveUp}
          canMoveDown={laneCanMoveDown}
          onRename={onLaneRename}
          onColor={onLaneColor}
          onResize={onLaneResize}
          onMove={onLaneMove}
          onDelete={onLaneDelete}
        />
      </PanelShell>
    );
  }

  if (edge) {
    return (
      <PanelShell onSave={onSave} saveState={saveState}>
        <div>
          <div className="text-[10.5px] font-bold tracking-[.08em] text-slate-400 uppercase">Conexão</div>
          <div className="mt-1.5 text-[15px] font-bold">Fluxo de sequência</div>
        </div>
        <TextField
          label="Rótulo / condição"
          value={typeof edge.label === "string" ? edge.label : ""}
          onChange={(v) => onEdgeChange({ label: v || undefined })}
          placeholder="Ex.: Sim, Não, > R$ 10 mil…"
        />
        <button onClick={onDelete} className="rounded-[9px] border border-danger-soft bg-danger-soft px-3 py-2 text-[12.5px] font-bold text-danger-strong hover:bg-red-100">
          Excluir conexão
        </button>
      </PanelShell>
    );
  }

  if (!node) {
    return (
      <div className="flex w-[300px] flex-none flex-col items-center justify-center gap-2 border-l border-border bg-surface px-5 py-6 text-center text-[12.5px] text-muted">
        Selecione um elemento no canvas para editar seus atributos, ou arraste um novo da paleta.
      </div>
    );
  }

  const data = node.data;
  const meta = NODE_META[data.kind];
  const isActivity = data.kind === "task" || data.kind === "subprocess";
  const isGateway = data.kind === "decision" || data.kind === "gateway_parallel" || data.kind === "gateway_inclusive";
  const isEvent = data.kind === "start" || data.kind === "end" || data.kind === "intermediate";

  return (
    <PanelShell onSave={onSave} saveState={saveState}>
      <div>
        <div className="text-[10.5px] font-bold tracking-[.08em] text-slate-400 uppercase">Propriedades</div>
        <div className="mt-1.5 text-[11.5px] font-semibold text-accent">{meta.typeName}</div>
      </div>

      <TextField label="Nome" value={data.label} onChange={(v) => onNodeChange({ label: v })} placeholder="Nome do elemento" />
      {data.kind !== "annotation" && (
        <TextArea label="Descrição" value={data.description} onChange={(v) => onNodeChange({ description: v })} placeholder="O que acontece, critério de aceite…" />
      )}

      {isActivity && (
        <>
          <SectionTitle>Responsabilidade</SectionTitle>
          <TextField label="Executor / Responsável" value={data.actor} onChange={(v) => onNodeChange({ actor: v })} placeholder="Cargo ou pessoa" />
          <TextField label="Área" value={data.area} onChange={(v) => onNodeChange({ area: v })} placeholder="Ex.: RH, Financeiro" />

          <SectionTitle>Execução</SectionTitle>
          <Field label="Tipo de atividade">
            <select value={data.activityType ?? "manual"} onChange={(e) => onNodeChange({ activityType: e.target.value as ActivityType })} className={inputCls}>
              {(Object.keys(activityTypeLabel) as ActivityType[]).map((t) => (
                <option key={t} value={t}>
                  {activityTypeLabel[t]}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center justify-between rounded-[10px] bg-page px-3 py-2.5">
            <div>
              <div className="text-[12px] font-bold">Usa IA nesta etapa</div>
              <div className="text-[10.5px] text-slate-400">Automação / triagem inteligente</div>
            </div>
            <button
              onClick={() => onNodeChange({ usesAI: !data.usesAI })}
              className={`relative h-5 w-9 flex-none rounded-full transition-colors ${data.usesAI ? "bg-accent" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${data.usesAI ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>
          <TagList label="Sistemas envolvidos" values={data.systems ?? []} onChange={(v) => onNodeChange({ systems: v })} placeholder="+ sistema" />
          <TextField label="Entradas (inputs)" value={data.inputs} onChange={(v) => onNodeChange({ inputs: v })} placeholder="Dados/documentos necessários" />
          <TextField label="Saídas (outputs)" value={data.outputs} onChange={(v) => onNodeChange({ outputs: v })} placeholder="Registros/resultados gerados" />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="SLA / Prazo" value={data.sla} onChange={(v) => onNodeChange({ sla: v })} placeholder="Ex.: 2h" />
            <TextField label="Custo estimado" value={data.cost} onChange={(v) => onNodeChange({ cost: v })} placeholder="Ex.: R$ 50" />
          </div>

          <SectionTitle>Controles e exceções</SectionTitle>
          <TextArea label="Pontos de controle" value={data.controls} onChange={(v) => onNodeChange({ controls: v })} placeholder="Verificações/aprovações obrigatórias" />
          <TextArea label="Exceções / desvios" value={data.exceptions} onChange={(v) => onNodeChange({ exceptions: v })} placeholder="Situações fora do fluxo padrão" />
          <TextField label="Indicador / KPI" value={data.kpi} onChange={(v) => onNodeChange({ kpi: v })} placeholder="Ex.: % sem retrabalho" />
        </>
      )}

      {isGateway && (
        <>
          <SectionTitle>Decisão</SectionTitle>
          <TextField label="Responsável pela decisão" value={data.actor} onChange={(v) => onNodeChange({ actor: v })} placeholder="Quem decide" />
        </>
      )}

      {(isActivity || isGateway || isEvent || data.kind === "data") && (
        <>
          <SectionTitle>Governança</SectionTitle>
          {(isActivity || isGateway) && (
            <Field label="Alerta de atualização">
              <select value={data.alertFrequency ?? "Sem alerta"} onChange={(e) => onNodeChange({ alertFrequency: e.target.value })} className={inputCls}>
                {alertFrequencyOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <TagList label="Tags personalizadas" values={data.tags ?? []} onChange={(v) => onNodeChange({ tags: v })} placeholder="+ tag" />
          <TextField label="Documentação (link)" value={data.documentation} onChange={(v) => onNodeChange({ documentation: v })} placeholder="URL do SOP / procedimento" />
        </>
      )}

      <div className="mt-1 flex gap-2">
        <button onClick={onDuplicate} className="flex-1 rounded-[9px] border border-border bg-page px-3 py-2 text-[12px] font-bold text-slate-600 hover:bg-slate-100">
          Duplicar
        </button>
        <button onClick={onDelete} className="flex-1 rounded-[9px] border border-danger-soft bg-danger-soft px-3 py-2 text-[12px] font-bold text-danger-strong hover:bg-red-100">
          Excluir
        </button>
      </div>
    </PanelShell>
  );
}

function LaneEditor({
  lane,
  canMoveUp,
  canMoveDown,
  onRename,
  onColor,
  onResize,
  onMove,
  onDelete,
}: {
  lane: Node<LaneNodeData>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRename: (v: string) => void;
  onColor: (i: number) => void;
  onResize: (delta: number) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const data = lane.data;
  return (
    <>
      <div>
        <div className="text-[10.5px] font-bold tracking-[.08em] text-slate-400 uppercase">Propriedades</div>
        <div className="mt-1.5 text-[11.5px] font-semibold text-accent">Raia (Swimlane)</div>
      </div>

      <TextField
        label="Responsável / Ator da raia"
        value={data.label}
        onChange={onRename}
        placeholder="Ex.: Recursos Humanos, Diretoria…"
      />
      <p className="-mt-1 text-[10.5px] leading-snug text-slate-400">
        Renomear atualiza o responsável das tarefas que estão nesta raia. Arraste tarefas para dentro dela para atribuí-las.
      </p>

      <SectionTitle>Cor</SectionTitle>
      <div className="flex gap-2">
        {LANE_SWATCHES.map((c, i) => {
          const active = (data.tone ?? 0) % LANE_SWATCHES.length === i;
          return (
            <button
              key={c}
              onClick={() => onColor(i)}
              className={`h-6 w-6 rounded-full border-2 transition-transform ${active ? "scale-110" : "border-transparent opacity-70 hover:opacity-100"}`}
              style={{ background: c, borderColor: active ? "#0f172a" : "transparent" }}
              title={`Cor ${i + 1}`}
            />
          );
        })}
      </div>

      <SectionTitle>Altura</SectionTitle>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onResize(-LANE_HEIGHT_STEP)}
          className="h-8 w-8 rounded-[9px] border border-border bg-page text-[15px] font-bold text-slate-600 hover:bg-slate-100"
        >
          −
        </button>
        <span className="flex-1 text-center text-[12.5px] font-semibold text-slate-600">{Math.round(data.height)}px</span>
        <button
          onClick={() => onResize(LANE_HEIGHT_STEP)}
          className="h-8 w-8 rounded-[9px] border border-border bg-page text-[15px] font-bold text-slate-600 hover:bg-slate-100"
        >
          +
        </button>
      </div>

      <SectionTitle>Ordem</SectionTitle>
      <div className="flex gap-2">
        <button
          onClick={() => onMove(-1)}
          disabled={!canMoveUp}
          className="flex-1 rounded-[9px] border border-border bg-page px-3 py-2 text-[12px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          ↑ Subir
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={!canMoveDown}
          className="flex-1 rounded-[9px] border border-border bg-page px-3 py-2 text-[12px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          ↓ Descer
        </button>
      </div>

      <button
        onClick={onDelete}
        className="mt-1 rounded-[9px] border border-danger-soft bg-danger-soft px-3 py-2 text-[12.5px] font-bold text-danger-strong hover:bg-red-100"
      >
        Excluir raia
      </button>
    </>
  );
}

function PanelShell({
  children,
  onSave,
  saveState,
}: {
  children: React.ReactNode;
  onSave: () => void;
  saveState: "idle" | "saving" | "saved" | "error";
}) {
  return (
    <div className="flex w-[300px] flex-none flex-col gap-3 overflow-auto border-l border-border bg-surface px-5 py-5">
      {children}
      <div className="sticky bottom-0 -mx-5 mt-1 flex items-center gap-2 border-t border-border-soft bg-surface px-5 pt-3">
        <button onClick={onSave} className="flex-1 rounded-[10px] bg-accent py-2.5 text-[13px] font-semibold text-white hover:bg-accent-hover">
          {saveState === "saving" ? "Salvando…" : "Salvar alterações"}
        </button>
        {saveState === "saved" && <span className="text-[11px] font-semibold text-success-strong">Salvo ✓</span>}
        {saveState === "error" && <span className="text-[11px] font-semibold text-danger-strong">Falhou</span>}
      </div>
    </div>
  );
}
