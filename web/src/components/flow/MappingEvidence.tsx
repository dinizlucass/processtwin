import type { PreMapping } from "@/lib/premapping";
import { reconcileTraceability } from "@/lib/mapping-evidence";

/** This is the generated draft's audit trail, not a certification of the edited model. */
export function MappingEvidence({ draft }: { draft: PreMapping }) {
  const requirements = draft.requirements ?? [];
  if (!requirements.length && !draft.reviewIssues?.length) return null;
  const traces = reconcileTraceability(draft.traceability, requirements, new Set(draft.nodes.map((node) => node.id)));
  const pending = traces.filter((entry) => entry.status === "pending").length;
  return (
    <section className="my-3 rounded-xl border border-border bg-surface p-3 text-[12px]" aria-label="Conferência da transcrição">
      <h3 className="font-bold">Conferência da transcrição · {pending} pendências</h3>
      {!!draft.reviewIssues?.length && <div role="alert" className="my-2 rounded-lg bg-amber-50 p-2 text-amber-900">
        <p className="font-semibold">A revisão ainda encontrou {draft.reviewIssues.length} pontos a corrigir:</p>
        <ul className="list-disc pl-4">{draft.reviewIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
      </div>}
      <p className="my-2 text-muted">Associações propostas pela IA na geração. Revise os caminhos e as condições; alterações manuais posteriores precisam de nova conferência.</p>
      <div className="flex flex-col gap-2">
        {requirements.map((requirement, i) => {
          const trace = traces[i];
          return (
            <details key={requirement.id} className="rounded-lg border border-border-soft p-2">
              <summary className="cursor-pointer font-semibold">{trace.status === "pending" ? "Pendente" : "Associado pela IA"} · {requirement.text}</summary>
              <blockquote className="my-2 border-l-2 border-border pl-2 text-muted">{requirement.quote}</blockquote>
              <p>{trace.explanation}</p>
              {trace.nodeIds.length > 0 && <p className="mt-1 text-muted">Elementos: {trace.nodeIds.map((id) => draft.nodes.find((node) => node.id === id)?.label).join(" → ")}</p>}
            </details>
          );
        })}
      </div>
    </section>
  );
}
