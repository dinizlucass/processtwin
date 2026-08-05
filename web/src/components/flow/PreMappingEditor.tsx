"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useStoreApi,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nodeTypes } from "@/components/flow/node-types";
import { toReactFlow, type DraftEdge, type DraftNode, type PreMapping } from "@/lib/premapping";
import type { ActivityType } from "@/lib/flow-types";

const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "semiautomatica", label: "Semiautomática" },
  { value: "automatizada", label: "Automatizada" },
];

const EDGE_LABELS = ["", "Sim", "Não"] as const;

function newId() {
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// toReactFlow gera ids de aresta como `e-<source>-<target>-<idx>`.
function edgeIndexFromId(id: string): number | null {
  const m = id.match(/-(\d+)$/);
  return m ? Number(m[1]) : null;
}

function Inner({ preMapping, onChange }: { preMapping: PreMapping; onChange: (pm: PreMapping) => void }) {
  const { nodes, edges } = useMemo(() => toReactFlow(preMapping), [preMapping]);
  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const [selEdgeIdx, setSelEdgeIdx] = useState<number | null>(null);
  const storeApi = useStoreApi();

  // Igual ao preview/ModelingCanvas: mede os nós manualmente (o ResizeObserver
  // automático não dispara de forma confiável) para as arestas aparecerem.
  useEffect(() => {
    const measure = () => {
      const state = storeApi.getState() as unknown as {
        domNode: HTMLElement | null;
        updateNodeInternals: (u: Map<string, { id: string; nodeElement: Element; force: boolean }>) => void;
      };
      const domNode = state.domNode;
      if (!domNode) return;
      const updates = new Map<string, { id: string; nodeElement: Element; force: boolean }>();
      domNode.querySelectorAll(".react-flow__node").forEach((el) => {
        const id = el.getAttribute("data-id");
        if (id) updates.set(id, { id, nodeElement: el, force: true });
      });
      if (updates.size) state.updateNodeInternals(updates);
    };
    const timers = [30, 120, 300, 600].map((d) => setTimeout(measure, d));
    return () => timers.forEach(clearTimeout);
  }, [preMapping.nodes.length, preMapping.edges.length, storeApi]);

  const selNode = preMapping.nodes.find((n) => n.id === selNodeId) ?? null;
  const selEdge = selEdgeIdx != null ? preMapping.edges[selEdgeIdx] ?? null : null;

  function patchNode(id: string, patch: Partial<DraftNode>) {
    onChange({ ...preMapping, nodes: preMapping.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  }
  function deleteNode(id: string) {
    onChange({
      ...preMapping,
      nodes: preMapping.nodes.filter((n) => n.id !== id),
      edges: preMapping.edges.filter((e) => e.source !== id && e.target !== id),
    });
    setSelNodeId(null);
  }
  function patchEdge(idx: number, patch: Partial<DraftEdge>) {
    onChange({ ...preMapping, edges: preMapping.edges.map((e, i) => (i === idx ? { ...e, ...patch } : e)) });
  }
  function deleteEdge(idx: number) {
    onChange({ ...preMapping, edges: preMapping.edges.filter((_, i) => i !== idx) });
    setSelEdgeIdx(null);
  }
  function addNode(kind: "task" | "decision") {
    const id = newId();
    const node: DraftNode =
      kind === "task"
        ? { id, kind: "task", label: "Nova etapa", activityType: "manual" }
        : { id, kind: "decision", label: "Nova decisão" };
    onChange({ ...preMapping, nodes: [...preMapping.nodes, node] });
    setSelNodeId(id);
    setSelEdgeIdx(null);
  }
  function onConnect(c: Connection) {
    if (!c.source || !c.target || c.source === c.target) return;
    onChange({ ...preMapping, edges: [...preMapping.edges, { source: c.source, target: c.target }] });
  }

  return (
    <div className="relative h-full">
      {/* Barra de adicionar */}
      <div className="absolute top-3 left-3 z-10 flex gap-1.5">
        <button
          onClick={() => addNode("task")}
          className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-sm hover:bg-page"
        >
          + Tarefa
        </button>
        <button
          onClick={() => addNode("decision")}
          className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-sm hover:bg-page"
        >
          + Decisão
        </button>
        <span className="self-center pl-1 text-[10.5px] text-slate-400">
          Selecione um nó para editar · arraste de uma alça para conectar
        </span>
      </div>

      {/* Editor do nó selecionado */}
      {selNode && (
        <div className="absolute top-3 right-3 z-10 w-60 rounded-[10px] border border-border bg-surface p-3 shadow-md">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.05em] text-muted">
            {selNode.kind === "decision" ? "Decisão" : selNode.kind === "task" ? "Tarefa" : selNode.kind}
          </div>
          <label className="mb-2 flex flex-col gap-1">
            <span className="text-[10.5px] font-semibold text-slate-500">Rótulo</span>
            <input
              value={selNode.label}
              onChange={(e) => patchNode(selNode.id, { label: e.target.value })}
              className="rounded-[7px] border border-border bg-page px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400"
            />
          </label>
          {(selNode.kind === "task" || selNode.kind === "decision") && (
            <label className="mb-2 flex flex-col gap-1">
              <span className="text-[10.5px] font-semibold text-slate-500">Executor (raia)</span>
              <input
                value={selNode.actor ?? ""}
                onChange={(e) => patchNode(selNode.id, { actor: e.target.value })}
                placeholder="Ex.: Analista de RH"
                className="rounded-[7px] border border-border bg-page px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400"
              />
            </label>
          )}
          {selNode.kind === "task" && (
            <label className="mb-2 flex flex-col gap-1">
              <span className="text-[10.5px] font-semibold text-slate-500">Tipo de atividade</span>
              <select
                value={selNode.activityType || "manual"}
                onChange={(e) => patchNode(selNode.id, { activityType: e.target.value as ActivityType })}
                className="rounded-[7px] border border-border bg-page px-2 py-1.5 text-[12px] outline-none focus:border-indigo-400"
              >
                {ACTIVITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selNode.kind !== "start" && selNode.kind !== "end" && (
            <button
              onClick={() => deleteNode(selNode.id)}
              className="mt-1 w-full rounded-[7px] border border-danger-soft px-3 py-1.5 text-[11.5px] font-semibold text-danger-strong hover:bg-danger-soft"
            >
              Excluir nó
            </button>
          )}
        </div>
      )}

      {/* Editor da aresta selecionada */}
      {selEdge && selEdgeIdx != null && (
        <div className="absolute top-3 right-3 z-10 w-56 rounded-[10px] border border-border bg-surface p-3 shadow-md">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.05em] text-muted">Conexão</div>
          <label className="mb-2 flex flex-col gap-1">
            <span className="text-[10.5px] font-semibold text-slate-500">Rótulo (saída de decisão)</span>
            <select
              value={selEdge.label ?? ""}
              onChange={(e) => patchEdge(selEdgeIdx, { label: e.target.value || undefined })}
              className="rounded-[7px] border border-border bg-page px-2 py-1.5 text-[12px] outline-none focus:border-indigo-400"
            >
              {EDGE_LABELS.map((l) => (
                <option key={l} value={l}>
                  {l === "" ? "— nenhum —" : l}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => deleteEdge(selEdgeIdx)}
            className="mt-1 w-full rounded-[7px] border border-danger-soft px-3 py-1.5 text-[11.5px] font-semibold text-danger-strong hover:bg-danger-soft"
          >
            Excluir conexão
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable
        elementsSelectable
        onConnect={onConnect}
        onNodeClick={(_, n) => {
          setSelNodeId(n.id);
          setSelEdgeIdx(null);
        }}
        onEdgeClick={(_, e) => {
          setSelEdgeIdx(edgeIndexFromId(e.id));
          setSelNodeId(null);
        }}
        onPaneClick={() => {
          setSelNodeId(null);
          setSelEdgeIdx(null);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function PreMappingEditor({
  preMapping,
  onChange,
}: {
  preMapping: PreMapping;
  onChange: (pm: PreMapping) => void;
}) {
  return (
    <ReactFlowProvider>
      <Inner preMapping={preMapping} onChange={onChange} />
    </ReactFlowProvider>
  );
}
