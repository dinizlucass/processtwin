import { listProcesses } from "@/lib/queries/processes";
import { listFolders, foldersEnabled } from "@/lib/queries/folders";
import { RepositoryExplorer } from "@/components/processes/RepositoryExplorer";

export const dynamic = "force-dynamic";

export default async function ProcessosPage() {
  const [processes, folders, enabled] = await Promise.all([listProcesses(), listFolders(), foldersEnabled()]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!enabled && (
        <div className="flex-none border-b border-warning bg-warning-soft px-7 py-2.5 text-[12px] font-semibold text-warning-text">
          As pastas ainda não estão ativas — rode a migração{" "}
          <code className="rounded bg-surface px-1 py-0.5">web/supabase/migrations/003_folders.sql</code> no SQL Editor do
          Supabase. O repositório continua funcionando como lista plana até lá.
        </div>
      )}
      <div className="min-h-0 flex-1">
        <RepositoryExplorer folders={folders} processes={processes} />
      </div>
    </div>
  );
}
