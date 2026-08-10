import Link from "next/link";
import { listConversations } from "@/lib/queries/conversations";
import { toneBadge } from "@/lib/tone";
import type { Tone } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

const statusTone: Record<string, Tone> = {
  em_andamento: "warning",
  premapeamento_gerado: "accent",
  concluida: "success",
};
const statusLabel: Record<string, string> = {
  em_andamento: "Em andamento",
  premapeamento_gerado: "Pré-mapeamento gerado",
  concluida: "Concluída",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function ConversasPage() {
  const conversations = await listConversations();

  return (
    <div className="flex max-w-[1080px] flex-col gap-5 px-8 py-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Histórico de Conversas</h1>
          <p className="mt-1 text-[13px] text-muted">
            {conversations.length} {conversations.length === 1 ? "entrevista" : "entrevistas"} com o Copilot de Mapeamento
          </p>
        </div>
        <Link
          href="/mapeamento"
          className="rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-hover"
        >
          + Nova conversa
        </Link>
      </div>

      <div className="flex flex-col gap-2.5">
        {conversations.map((c) => {
          const resumable = c.status !== "concluida";
          return (
            <div
              key={c.id}
              className="group flex items-center gap-4 rounded-[14px] border border-border bg-surface px-5 py-4 shadow-sm transition-colors hover:border-accent-soft-border hover:bg-accent-soft/40"
            >
              <Link href={`/conversas/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-gradient-to-br from-accent-2 to-accent">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-bold text-slate-800">{c.title}</span>
                    {c.processCode && (
                      <span className="flex-none rounded-full bg-page px-2 py-0.5 text-[10px] font-bold text-muted">
                        {c.processCode}
                      </span>
                    )}
                  </div>
                  {c.preview && <p className="mt-0.5 truncate text-[12px] text-muted">{c.preview}</p>}
                </div>
              </Link>

              <div className="flex flex-none flex-col items-end gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toneBadge[statusTone[c.status] ?? "accent"]}`}>
                  {statusLabel[c.status] ?? c.status}
                </span>
                <span className="text-[11px] text-slate-400">
                  {c.userMessageCount} {c.userMessageCount === 1 ? "resposta" : "respostas"} · {formatWhen(c.updatedAt)}
                </span>
              </div>

              <div className="flex flex-none items-center gap-2 border-l border-border-soft pl-4">
                {resumable ? (
                  <Link
                    href={`/mapeamento?c=${c.id}`}
                    className="rounded-[9px] bg-accent px-3 py-2 text-[12px] font-bold text-white hover:bg-accent-hover"
                  >
                    Continuar →
                  </Link>
                ) : c.processId ? (
                  <Link
                    href={`/modelagem/${c.processId}`}
                    className="rounded-[9px] border border-border px-3 py-2 text-[12px] font-semibold text-accent hover:bg-accent-soft"
                  >
                    Abrir processo →
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}

        {conversations.length === 0 && (
          <div className="rounded-[14px] border border-border bg-surface px-5 py-10 text-center text-[13px] text-muted shadow-sm">
            Nenhuma conversa ainda. Inicie uma entrevista pelo{" "}
            <Link href="/mapeamento" className="font-bold text-accent hover:text-accent-hover">
              Copilot de Mapeamento
            </Link>
            .
          </div>
        )}
      </div>
    </div>
  );
}
