"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState, type ReactNode, type Ref } from "react";
import {
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  MiniMap,
  Node,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStoreApi,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Palette } from "@/components/flow/Palette";
import { PropertiesPanel } from "@/components/flow/PropertiesPanel";
import { nodeTypes } from "@/components/flow/node-types";
import { NODE_SIZE, defaultDataForKind, type FlowNodeData, type NodeKind } from "@/lib/flow-types";
import type { LaneNodeData } from "@/lib/premapping";
import {
  DEFAULT_LANE_HEIGHT,
  LANE_COLOR_COUNT,
  LANE_HEIGHT_STEP,
  MIN_LANE_HEIGHT,
  isLane,
  laneBandAt,
  makeLane,
  nextLaneId,
  reflowLanes,
} from "@/lib/lanes";

let nextId = 1000;

// tipos que "vivem" numa raia (recebem o responsável da raia ao serem soltos nela)
const ASSIGNABLE: ReadonlySet<NodeKind> = new Set<NodeKind>(["task", "subprocess", "data"]);

function labelStyleFor(label?: string) {
  if (label === "Não") return { stroke: "#94a3b8", strokeDasharray: "5 4" };
  return { stroke: "#94a3b8" };
}
function labelTextStyleFor(label?: string) {
  if (label === "Sim") return { fill: "#059669", fontWeight: 700, fontSize: 11 };
  if (label === "Não") return { fill: "#dc2626", fontWeight: 700, fontSize: 11 };
  return { fill: "#475569", fontWeight: 700, fontSize: 11 };
}

function minimapColor(node: Node): string {
  if (node.type === "lane") return "transparent";
  const kind = (node.data as FlowNodeData)?.kind;
  if (kind === "start") return "#10b981";
  if (kind === "end") return "#ef4444";
  if (kind === "decision" || kind === "gateway_parallel" || kind === "gateway_inclusive") return "#f59e0b";
  if (kind === "data" || kind === "annotation") return "#94a3b8";
  return "#6366f1";
}

function nodeHeight(n: Node): number {
  const size = NODE_SIZE[(n.data as FlowNodeData)?.kind as NodeKind] ?? NODE_SIZE.task;
  return (n.height ?? n.initialHeight ?? size.height) as number;
}

export interface FlowSavePayload {
  nodes: { id: string; type?: string; position: { x: number; y: number }; data: FlowNodeData }[];
  edges: { id: string; source: string; target: string; sourceHandle?: string | null; label?: unknown }[];
  lanes: { id: string; label: string; posY: number; colorIndex: number; height: number; order: number }[];
}

// Handle imperativo para ler o fluxo atualmente na tela (usado pelo ajuste da IA).
export interface ModelingCanvasHandle {
  getCurrentFlow: () => FlowSavePayload;
}

interface ModelingCanvasProps {
  processId?: string;
  processName: string;
  initialVersion: number;
  initialNodes: Node[];
  initialEdges: Edge[];
  // Modo rascunho (pré-mapeamento): quando presente, o "Salvar" chama isto em
  // vez de gravar em /api/flow (que exige um processId já existente).
  onSave?: (payload: FlowSavePayload) => Promise<void>;
  saveLabel?: string;
  headerBadge?: string;
  topBarExtra?: ReactNode;
}

function Canvas({
  processId,
  processName,
  initialVersion,
  initialNodes,
  initialEdges,
  onSave,
  saveLabel,
  headerBadge,
  topBarExtra,
  handleRef,
}: ModelingCanvasProps & { handleRef?: Ref<ModelingCanvasHandle> }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(reflowLanes(initialNodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null);
  const [version, setVersion] = useState(initialVersion);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const { screenToFlowPosition } = useReactFlow();
  const storeApi = useStoreApi();

  // Nesta stack (Next + React Flow v12) o ResizeObserver automático dos nós não
  // dispara de forma confiável — medimos manualmente para as arestas aparecerem.
  useEffect(() => {
    if (nodes.length === 0) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, storeApi]);

  const clearSelection = () => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedLaneId(null);
  };

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, type: "smoothstep", style: { stroke: "#94a3b8" } }, eds)),
    [setEdges],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/x-processtwin-node") as NodeKind;
      if (!kind) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = `n-${nextId++}`;
      const size = NODE_SIZE[kind];
      const data = defaultDataForKind(kind);
      setNodes((nds) => {
        // se soltou dentro de uma raia, herda o responsável dela
        if (ASSIGNABLE.has(kind)) {
          const band = laneBandAt(position.y + size.height / 2, nds);
          if (band) data.actor = (band.data as LaneNodeData).label;
        }
        return reflowLanes([
          ...nds,
          { id, type: kind, position, initialWidth: size.width, initialHeight: size.height, data },
        ]);
      });
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      setSelectedLaneId(null);
    },
    [screenToFlowPosition, setNodes],
  );

  // Ao soltar um nó, atribui-o à raia sob ele (responsável) e reflui as larguras.
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (isLane(node)) return;
      setNodes((nds) => {
        const kind = (node.data as FlowNodeData)?.kind as NodeKind;
        let next = nds;
        if (ASSIGNABLE.has(kind)) {
          const cy = node.position.y + nodeHeight(node) / 2;
          const band = laneBandAt(cy, nds);
          if (band) {
            const actor = (band.data as LaneNodeData).label;
            next = nds.map((n) => (n.id === node.id ? { ...n, data: { ...(n.data as FlowNodeData), actor } } : n));
          }
        }
        return reflowLanes(next);
      });
    },
    [setNodes],
  );

  const selectedNode = (nodes.find((n) => n.id === selectedNodeId && !isLane(n)) ?? null) as Node<FlowNodeData> | null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;
  const selectedLane = (nodes.find((n) => n.id === selectedLaneId && isLane(n)) ?? null) as Node<LaneNodeData> | null;

  const laneOrder = nodes
    .filter(isLane)
    .sort((a, b) => ((a.data as LaneNodeData).order ?? 0) - ((b.data as LaneNodeData).order ?? 0));
  const laneIndex = selectedLane ? laneOrder.findIndex((l) => l.id === selectedLane.id) : -1;

  const patchNode = useCallback(
    (patch: Partial<FlowNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...(n.data as FlowNodeData), ...patch } } : n)),
      );
    },
    [selectedNodeId, setNodes],
  );

  const patchEdge = useCallback(
    (patch: Partial<Edge>) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === selectedEdgeId
            ? {
                ...e,
                ...patch,
                style: labelStyleFor(typeof patch.label === "string" ? patch.label : (e.label as string)),
                labelStyle: labelTextStyleFor(typeof patch.label === "string" ? patch.label : (e.label as string)),
              }
            : e,
        ),
      );
    },
    [selectedEdgeId, setEdges],
  );

  // ---------- Raias ----------

  const addLane = useCallback(() => {
    // id gerado FORA do updater — StrictMode invoca o updater 2x e geração de id
    // ali dentro criaria ids divergentes (a seleção apontaria para um id descartado).
    const id = nextLaneId();
    setNodes((nds) => {
      const count = nds.filter(isLane).length;
      const lane = makeLane(`Nova raia ${count + 1}`, count % LANE_COLOR_COUNT, count, DEFAULT_LANE_HEIGHT, id);
      return reflowLanes([...nds, lane]);
    });
    setSelectedLaneId(id);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [setNodes]);

  const renameLane = useCallback(
    (laneId: string, label: string) => {
      setNodes((nds) => {
        const lane = nds.find((n) => n.id === laneId);
        if (!lane) return nds;
        const top = lane.position.y;
        const h = (lane.height ?? (lane.data as LaneNodeData).height ?? DEFAULT_LANE_HEIGHT) as number;
        return reflowLanes(
          nds.map((n) => {
            if (n.id === laneId) return { ...n, data: { ...(n.data as LaneNodeData), label } };
            const kind = (n.data as FlowNodeData)?.kind as NodeKind;
            if (!isLane(n) && ASSIGNABLE.has(kind)) {
              const cy = n.position.y + nodeHeight(n) / 2;
              if (cy >= top && cy < top + h) return { ...n, data: { ...(n.data as FlowNodeData), actor: label } };
            }
            return n;
          }),
        );
      });
    },
    [setNodes],
  );

  const setLaneColor = useCallback(
    (laneId: string, tone: number) => {
      setNodes((nds) => nds.map((n) => (n.id === laneId ? { ...n, data: { ...(n.data as LaneNodeData), tone } } : n)));
    },
    [setNodes],
  );

  const resizeLane = useCallback(
    (laneId: string, delta: number) => {
      setNodes((nds) =>
        reflowLanes(
          nds.map((n) => {
            if (n.id !== laneId) return n;
            const d = n.data as LaneNodeData;
            const height = Math.max(MIN_LANE_HEIGHT, (d.height ?? DEFAULT_LANE_HEIGHT) + delta);
            return { ...n, height, data: { ...d, height } };
          }),
        ),
      );
    },
    [setNodes],
  );

  const moveLane = useCallback(
    (laneId: string, dir: -1 | 1) => {
      setNodes((nds) => {
        const lanes = nds
          .filter(isLane)
          .sort((a, b) => ((a.data as LaneNodeData).order ?? 0) - ((b.data as LaneNodeData).order ?? 0));
        const idx = lanes.findIndex((l) => l.id === laneId);
        const swap = idx + dir;
        if (idx < 0 || swap < 0 || swap >= lanes.length) return nds;
        const a = lanes[idx];
        const b = lanes[swap];
        return reflowLanes(
          nds.map((n) => {
            if (n.id === a.id) return { ...n, data: { ...(n.data as LaneNodeData), order: swap } };
            if (n.id === b.id) return { ...n, data: { ...(n.data as LaneNodeData), order: idx } };
            return n;
          }),
        );
      });
    },
    [setNodes],
  );

  const deleteLane = useCallback(
    (laneId: string) => {
      setNodes((nds) => reflowLanes(nds.filter((n) => n.id !== laneId)));
      setSelectedLaneId(null);
    },
    [setNodes],
  );

  // ---------- Nós / arestas ----------

  const duplicateSelected = useCallback(() => {
    if (!selectedNode) return;
    const id = `n-${nextId++}`;
    setNodes((nds) => [
      ...nds,
      {
        ...selectedNode,
        id,
        position: { x: selectedNode.position.x + 40, y: selectedNode.position.y + 40 },
        data: { ...selectedNode.data },
        selected: false,
      },
    ]);
    setSelectedNodeId(id);
  }, [selectedNode, setNodes]);

  const deleteSelected = useCallback(() => {
    if (selectedLaneId) {
      deleteLane(selectedLaneId);
      return;
    }
    if (selectedEdgeId) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
      return;
    }
    if (selectedNodeId) {
      setNodes((nds) => reflowLanes(nds.filter((n) => n.id !== selectedNodeId)));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, selectedEdgeId, selectedLaneId, deleteLane, setNodes, setEdges]);

  const buildPayload = useCallback((): FlowSavePayload => {
    const contentNodes = nodes.filter((n) => !isLane(n));
    const laneNodes = nodes
      .filter(isLane)
      .sort((a, b) => ((a.data as LaneNodeData).order ?? 0) - ((b.data as LaneNodeData).order ?? 0));
    return {
      nodes: contentNodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data as FlowNodeData })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, label: e.label })),
      lanes: laneNodes.map((l, i) => {
        const d = l.data as LaneNodeData;
        return { id: l.id, label: d.label, posY: l.position.y, colorIndex: d.tone, height: d.height, order: i };
      }),
    };
  }, [nodes, edges]);

  useImperativeHandle(handleRef, () => ({ getCurrentFlow: buildPayload }), [buildPayload]);

  const handleSave = useCallback(async () => {
    setSaveState("saving");
    try {
      const payload = buildPayload();

      // Modo rascunho: delega o salvar (criar processo + gravar fluxo) ao pai.
      if (onSave) {
        await onSave(payload);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1800);
        return;
      }

      const res = await fetch("/api/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId, ...payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { version: newVersion } = (await res.json()) as { version: number };
      setVersion(newVersion);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1800);
    } catch (err) {
      console.error("[modelagem] falha ao salvar", err);
      setSaveState("error");
    }
  }, [processId, buildPayload, onSave]);

  const contentCount = nodes.filter((n) => !isLane(n)).length;
  const laneCount = nodes.filter(isLane).length;

  return (
    <div className="flex h-full">
      <Palette />

      <div className="relative flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <div className="absolute top-4 left-5 z-10 flex items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3.5 py-2 shadow-sm">
          {topBarExtra}
          <span className="text-[13px] font-bold">{processName}</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent-hover">
            {headerBadge ?? `RASCUNHO · v${version}`}
          </span>
          <span className="text-[10.5px] text-slate-400">
            {contentCount} elementos · {laneCount} raias · {edges.length} conexões
          </span>
          <button
            onClick={addLane}
            className="ml-1 flex items-center gap-1 rounded-[8px] border border-accent-soft-border bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent-hover hover:bg-indigo-100"
            title="Adicionar uma raia (ator/responsável)"
          >
            <span className="text-[13px] leading-none">+</span> Raia
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1 rounded-[8px] bg-accent px-3 py-1 text-[11px] font-bold text-white hover:bg-accent-hover"
            title="Salvar o processo"
          >
            {saveState === "saving" ? "Salvando…" : saveLabel ?? "Salvar"}
          </button>
          {saveState === "saved" && <span className="text-[10.5px] font-bold text-success-strong">Salvo ✓</span>}
          {saveState === "error" && <span className="text-[10.5px] font-bold text-danger-strong">Falhou</span>}
        </div>

        {(selectedNode || selectedEdge) && (
          <div className="absolute top-4 right-5 z-10 flex items-center gap-1.5">
            {selectedNode && (
              <button
                onClick={duplicateSelected}
                className="rounded-[9px] border border-border bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-slate-600 shadow-sm hover:bg-page"
              >
                Duplicar
              </button>
            )}
            <button
              onClick={deleteSelected}
              className="rounded-[9px] border border-danger-soft bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-danger-strong shadow-sm hover:bg-danger-soft"
            >
              Excluir
            </button>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_, node) => {
            if (isLane(node)) {
              setSelectedLaneId(node.id);
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
              return;
            }
            setSelectedNodeId(node.id);
            setSelectedEdgeId(null);
            setSelectedLaneId(null);
          }}
          onEdgeClick={(_, edge) => {
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(null);
            setSelectedLaneId(null);
          }}
          onPaneClick={clearSelection}
          onNodesDelete={(deleted) => {
            if (deleted.some((n) => n.id === selectedNodeId)) setSelectedNodeId(null);
          }}
          onEdgesDelete={(deleted) => {
            if (deleted.some((e) => e.id === selectedEdgeId)) setSelectedEdgeId(null);
          }}
          nodeTypes={nodeTypes}
          deleteKeyCode={["Delete", "Backspace"]}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
          <Controls showInteractive={false} />
          <MiniMap nodeColor={minimapColor} nodeStrokeWidth={2} pannable zoomable className="!bg-surface" />
        </ReactFlow>
      </div>

      <PropertiesPanel
        node={selectedNode}
        edge={selectedEdge}
        lane={selectedLane}
        laneCanMoveUp={laneIndex > 0}
        laneCanMoveDown={laneIndex >= 0 && laneIndex < laneOrder.length - 1}
        onNodeChange={patchNode}
        onEdgeChange={patchEdge}
        onLaneRename={(v) => selectedLaneId && renameLane(selectedLaneId, v)}
        onLaneColor={(i) => selectedLaneId && setLaneColor(selectedLaneId, i)}
        onLaneResize={(d) => selectedLaneId && resizeLane(selectedLaneId, d)}
        onLaneMove={(dir) => selectedLaneId && moveLane(selectedLaneId, dir)}
        onLaneDelete={() => selectedLaneId && deleteLane(selectedLaneId)}
        onDelete={deleteSelected}
        onDuplicate={duplicateSelected}
        onSave={handleSave}
        saveState={saveState}
      />
    </div>
  );
}

export const ModelingCanvas = forwardRef<ModelingCanvasHandle, ModelingCanvasProps>(function ModelingCanvas(props, ref) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} handleRef={ref} />
    </ReactFlowProvider>
  );
});
