"use client";

import { useEffect } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useStoreApi,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nodeTypes } from "@/components/flow/node-types";
import { toReactFlow, type PreMapping } from "@/lib/premapping";

function Inner({ preMapping }: { preMapping: PreMapping }) {
  const { nodes, edges } = toReactFlow(preMapping);
  const storeApi = useStoreApi();

  // Ver ModelingCanvas: mede os nós manualmente (o ResizeObserver automático
  // não dispara de forma confiável) para as arestas aparecerem.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preMapping]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function PreMappingPreview({ preMapping }: { preMapping: PreMapping }) {
  return (
    <ReactFlowProvider>
      <Inner preMapping={preMapping} />
    </ReactFlowProvider>
  );
}
