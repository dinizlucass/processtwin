"use client";

import { useCallback, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  Node,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Palette } from "@/components/flow/Palette";
import { PropertiesPanel } from "@/components/flow/PropertiesPanel";
import { TaskNode } from "@/components/flow/nodes/TaskNode";
import { DecisionNode } from "@/components/flow/nodes/DecisionNode";
import { StartEndNode } from "@/components/flow/nodes/StartEndNode";
import type { FlowNodeData, NodeKind } from "@/lib/flow-types";

const nodeTypes = {
  task: TaskNode,
  decision: DecisionNode,
  start: StartEndNode,
  end: StartEndNode,
};

let nextId = 100;

function newNodeData(kind: NodeKind): FlowNodeData {
  if (kind === "task") {
    return { kind, label: "Nova Tarefa", activityType: "manual", alertFrequency: "Sem alerta", tags: [], usesAI: false };
  }
  if (kind === "decision") {
    return { kind, label: "Decisão?", alertFrequency: "Sem alerta", tags: [], usesAI: false };
  }
  return { kind, label: kind === "start" ? "Início" : "Fim" };
}

interface ModelingCanvasProps {
  processId: string;
  processName: string;
  initialVersion: number;
  initialNodes: Node<FlowNodeData>[];
  initialEdges: Edge[];
}

function Canvas({ processId, processName, initialVersion, initialNodes, initialEdges }: ModelingCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [version, setVersion] = useState(initialVersion);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const { screenToFlowPosition } = useReactFlow();

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, type: "smoothstep" }, eds)),
    [setEdges],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/x-processtwin-node") as NodeKind;
      if (!kind) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = `n-${nextId++}`;
      setNodes((nds) => [...nds, { id, type: kind, position, data: newNodeData(kind) }]);
      setSelectedId(id);
    },
    [screenToFlowPosition, setNodes],
  );

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  const patchSelected = useCallback(
    (patch: Partial<FlowNodeData>) => {
      setNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [selectedId, setNodes],
  );

  const handleSave = useCallback(async () => {
    setSaveState("saving");
    try {
      const res = await fetch("/api/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processId,
          nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
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
          {saveState === "saving" && <span className="text-[11px] font-semibold text-muted">Salvando…</span>}
          {saveState === "saved" && <span className="text-[11px] font-semibold text-success-strong">Salvo ✓</span>}
          {saveState === "error" && <span className="text-[11px] font-semibold text-danger-strong">Falha ao salvar</span>}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <PropertiesPanel node={selectedNode} onChange={patchSelected} onSave={handleSave} />
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
