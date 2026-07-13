import { notFound } from "next/navigation";
import { ModelingCanvas } from "@/components/flow/ModelingCanvas";
import { getProcessFlow } from "@/lib/queries/flow";

export const dynamic = "force-dynamic";

export default async function ModelagemManualPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let flow;
  try {
    flow = await getProcessFlow(id);
  } catch {
    notFound();
  }

  const { processId, name, version, nodes, edges } = flow;

  return (
    <ModelingCanvas
      processId={processId}
      processName={name}
      initialVersion={version}
      initialNodes={nodes}
      initialEdges={edges}
    />
  );
}
