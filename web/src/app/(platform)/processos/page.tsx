import Link from "next/link";
import { listProcesses } from "@/lib/queries/processes";
import { NewProcessForm } from "@/components/processes/NewProcessForm";
import { toneBadge } from "@/lib/tone";
import type { Tone } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

const criticalityTone: Record<string, Tone> = { alta: "danger", media: "warning", baixa: "success" };
const criticalityLabel: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const statusTone: Record<string, Tone> = { rascunho: "accent", em_revisao: "warning", publicado: "success", obsoleto: "danger" };
const statusLabel: Record<string, string> = { rascunho: "Rascunho", em_revisao: "Em revisão", publicado: "Publicado", obsoleto: "Obsoleto" };

export default async function ProcessosPage() {
  const processes = await listProcesses();

  return (
    <div className="flex max-w-[1240px] flex-col gap-5 px-8 py-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Repositório de Processos</h1>
          <p className="mt-1 text-[13px] text-muted">
            {processes.length} processos · fonte única para o Dashboard, a Modelagem Manual e (em breve) o Gêmeo Digital
          </p>
        </div>
        <NewProcessForm />
      </div>

      <div className="overflow-hidden rounded-[14px] border border-border bg-surface shadow-sm">
        <div className="grid grid-cols-[2fr_1fr_0.9fr_1fr_0.8fr_0.6fr_1.2fr] gap-3 border-b border-border bg-page px-5 py-3 text-[10.5px] font-bold tracking-[.07em] text-muted uppercase">
          <span>Processo</span>
          <span>Departamento</span>
          <span>Criticidade</span>
          <span>Status</span>
          <span>Mapeado</span>
          <span>Versão</span>
          <span>Ação</span>
        </div>
        {processes.map((p) => (
          <div
            key={p.id}
            className="grid grid-cols-[2fr_1fr_0.9fr_1fr_0.8fr_0.6fr_1.2fr] items-center gap-3 border-b border-border-soft px-5 py-3.5 text-[12.5px] last:border-b-0"
          >
            <div>
              <div className="font-bold text-slate-800">{p.name}</div>
              <div className="text-[11px] text-muted">
                {p.code}
                {p.ownerName ? ` · ${p.ownerName}` : ""}
              </div>
            </div>
            <span className="text-slate-600">{p.department ?? "—"}</span>
            <span>
              {p.criticality ? (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toneBadge[criticalityTone[p.criticality]]}`}>
                  {criticalityLabel[p.criticality]}
                </span>
              ) : (
                "—"
              )}
            </span>
            <span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toneBadge[statusTone[p.status] ?? "accent"]}`}>
                {statusLabel[p.status] ?? p.status}
              </span>
            </span>
            <span className={`text-[11px] font-bold ${p.mapped ? "text-success-strong" : "text-slate-300"}`}>
              {p.mapped ? "Sim" : "Não"}
            </span>
            <span className="text-muted">v{p.version}</span>
            <Link href={`/modelagem/${p.id}`} className="text-[12px] font-bold text-accent hover:text-accent-hover">
              {p.mapped ? "Abrir no modelador →" : "Mapear agora →"}
            </Link>
          </div>
        ))}
        {processes.length === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-muted">
            Nenhum processo ainda. Crie um acima ou mapeie um pelo Copilot de IA.
          </div>
        )}
      </div>
    </div>
  );
}
