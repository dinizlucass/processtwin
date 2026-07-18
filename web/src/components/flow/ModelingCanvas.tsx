"use client";

import { useCallback, useEffect, useState } from "react";
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

let nextId = 1000;

function labelStyleFor(label?: string) {
  if (label === "Sim") return { stroke: "#94a3b8" };
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

interface ModelingCanvasProps {
  processId: string;
  processName: string;
  initialVersion: number;
  initialNodes: Node[];
  initialEdges: Edge[];
}

function Canvas({ processId, processName, initialVersion, initialNodes, initialEdges }: ModelingCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [version, setVersion] = useState(initialVersion);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const { screenToFlowPosition } = useReactFlow();
  const storeApi = useStoreApi();

  // Nesta stack (Next + React Flow v12) o ResizeObserver automático dos nós
  // não dispara de forma confiável, então os nós ficam sem `measured`/
  // handleBounds e o React Flow pula TODAS as arestas (getEdgePosition retorna
  // null para nó não inicializado). Medimos os nós manualmente após o DOM
  // montar — com retries e re-executando quando o número de nós muda.
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
      setNodes((nds) => [
        ...nds,
        { id, type: kind, position, initialWidth: size.width, initialHeight: size.height, data: defaultDataForKind(kind) },
      ]);
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
    },
    [screenToFlowPosition, setNodes],
  );

  const selectedNode = (nodes.find((n) => n.id === selectedNodeId) ?? null) as Node<FlowNodeData> | null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;

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
    if (selectedEdgeId) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
      return;
    }
    if (selectedNodeId) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, selectedEdgeId, setNodes, setEdges]);

  const handleSave = useCallback(async () => {
    setSaveState("saving");
    try {
      const res = await fetch("/api/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processId,
          nodes: nodes
            .filter((n) => n.type !== "lane")
            .map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
          edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, label: e.label })),
        }),
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
  }, [processId, nodes, edges]);

  return (
    <div className="flex h-full">
      <Palette />

      <div className="relative flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <div className="absolute top-4 left-5 z-10 flex items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3.5 py-2 shadow-sm">
          <span className="text-[13px] font-bold">{processName}</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent-hover">
            RASCUNHO · v{version}
          </span>
          <span className="text-[10.5px] text-slate-400">
            {nodes.filter((n) => n.type !== "lane").length} elementos · {edges.length} conexões
          </span>
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
          onNodeClick={(_, node) => {
            if (node.type === "lane") return;
            setSelectedNodeId(node.id);
            setSelectedEdgeId(null);
          }}
          onEdgeClick={(_, edge) => {
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(null);
          }}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
          }}
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
        onNodeChange={patchNode}
        onEdgeChange={patchEdge}
        onDelete={deleteSelected}
        onDuplicate={duplicateSelected}
        onSave={handleSave}
        saveState={saveState}
      />
    </div>
  );
}

export function ModelingCanvas(props: ModelingCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
