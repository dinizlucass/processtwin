"use client";

import { useEffect } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useUpdateNodeInternals,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nodeTypes } from "@/components/flow/node-types";
import { toReactFlow, type PreMapping } from "@/lib/premapping";

function Inner({ preMapping }: { preMapping: PreMapping }) {
  const { nodes, edges } = toReactFlow(preMapping);
  const updateNodeInternals = useUpdateNodeInternals();

  // Ver ModelingCanvas: força a medição dos handles para as arestas aparecerem.
  useEffect(() => {
    const ids = nodes.map((n) => n.id);
    const raf = requestAnimationFrame(() => ids.forEach((id) => updateNodeInternals(id)));
    return () => cancelAnimationFrame(raf);
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
