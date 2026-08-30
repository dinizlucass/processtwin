import { getProcessGraphData } from "@/lib/queries/graph";
import { ProcessGraphCanvas } from "@/components/graph/ProcessGraphCanvas";

export const dynamic = "force-dynamic";

export default async function GrafoPage() {
  const { processes, folders, foldersEnabled, systemsByProcess } = await getProcessGraphData();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProcessGraphCanvas
        processes={processes}
        folders={folders}
        foldersEnabled={foldersEnabled}
        systemsByProcess={systemsByProcess}
      />
    </div>
  );
}
