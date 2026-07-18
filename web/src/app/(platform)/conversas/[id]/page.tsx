import Link from "next/link";
import { notFound } from "next/navigation";
import { getConversation } from "@/lib/queries/conversations";
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
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function ConversaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) notFound();

  return (
    <div className="mx-auto flex h-full max-w-[860px] flex-col gap-4 px-8 py-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-2">
        <Link href="/conversas" className="text-[12px] font-semibold text-muted hover:text-accent">
          ← Histórico de conversas
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 truncate text-[20px] font-bold tracking-tight">{conversation.title}</h1>
            <p className="mt-0.5 text-[12px] text-muted">
              {conversation.userMessageCount} respostas · iniciada em {formatWhen(conversation.createdAt)}
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${toneBadge[statusTone[conversation.status] ?? "accent"]}`}>
              {statusLabel[conversation.status] ?? conversation.status}
            </span>
            {conversation.processId && (
              <Link
                href={`/modelagem/${conversation.processId}`}
                className="rounded-[9px] bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover"
              >
                Abrir processo →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Transcrição */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto rounded-2xl border border-border bg-slate-50/60 p-5 shadow-sm">
        {conversation.messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-[4px] bg-accent text-white"
                  : "rounded-bl-[4px] border border-border bg-surface text-slate-800"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {conversation.messages.length === 0 && (
          <div className="py-8 text-center text-[13px] text-muted">Esta conversa não tem mensagens registradas.</div>
        )}
      </div>
    </div>
  );
}
