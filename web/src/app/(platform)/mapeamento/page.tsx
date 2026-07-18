"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PreMappingPreview } from "@/components/flow/PreMappingPreview";
import { VoiceInput } from "@/components/voice/VoiceInput";
import type { PreMapping } from "@/lib/premapping";

interface Message {
  role: "ai" | "user";
  text: string;
}

const PHASES = [
  "Desafio estratégico",
  "Escopo e resultados",
  "Fluxo (etapas + executores)",
  "Sistemas e governança",
  "Regras e decisões",
  "Volume, tempo e SLAs",
  "Dores e riscos",
];

const OPENING =
  "Vamos mapear este processo juntos, como uma dupla de consultoria. Antes de desenhar os passos: qual é o processo, e por que ele precisa existir? Se pudesse ser redesenhado do zero hoje, ainda faria sentido?";

export default function MapeamentoPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([{ role: "ai", text: OPENING }]);
  const [input, setInput] = useState("");
  const [suggestion, setSuggestion] = useState("Admissão de Colaboradores — garante contratação em conformidade");
  const [phase, setPhase] = useState(1);
  const [canGenerate, setCanGenerate] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);

  const [mode, setMode] = useState<"interview" | "review">("interview");
  const [draft, setDraft] = useState<PreMapping | null>(null);
  const [generating, setGenerating] = useState(false);
  const [adjustText, setAdjustText] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const chatRef = useRef<HTMLDivElement>(null);
  const conversationId = useRef<string | null>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  async function persistConversation(msgs: Message[], status: string, processId?: string) {
    try {
      const res = await fetch("/api/ai-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conversationId.current, messages: msgs, extractedFields: {}, status, processId }),
      });
      const { id } = (await res.json()) as { id: string };
      conversationId.current = id;
    } catch (err) {
      console.error("[mapeamento] falha ao salvar conversa", err);
    }
  }

  async function send(rawText?: string) {
    if (loadingChat) return;
    const text = (rawText ?? input).trim();
    if (!text) return;

    const afterUser = [...messages, { role: "user" as const, text }];
    setMessages(afterUser);
    setInput("");
    setSuggestion("");
    setLoadingChat(true);

    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: afterUser }),
      });
      const data = (await res.json()) as { reply: string; suggestion: string; phase: number; readyToGenerate: boolean };
      const afterAi = [...afterUser, { role: "ai" as const, text: data.reply }];
      setMessages(afterAi);
      setSuggestion(data.suggestion || "");
      setPhase(data.phase || phase);
      setCanGenerate(data.readyToGenerate);
      void persistConversation(afterAi, "em_andamento");
    } catch (err) {
      console.error("[mapeamento] falha no chat", err);
      setMessages([...afterUser, { role: "ai", text: "Tive um problema para responder. Pode repetir?" }]);
    } finally {
      setLoadingChat(false);
    }
  }

  async function generate(adjustment?: string) {
    setGenerating(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/copilot/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, adjustment, previousDraft: draft }),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string };
        throw new Error(error ?? "Falha ao gerar");
      }
      const { draft: newDraft } = (await res.json()) as { draft: PreMapping };
      setDraft(newDraft);
      setMode("review");
      setAdjustText("");
      void persistConversation(messages, "premapeamento_gerado");
    } catch (err) {
      console.error("[mapeamento] falha ao gerar pré-mapeamento", err);
      setErrorMsg(err instanceof Error ? err.message : "Falha ao gerar o pré-mapeamento.");
    } finally {
      setGenerating(false);
    }
  }

  async function commit() {
    if (!draft) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/mapping/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, conversationId: conversationId.current }),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string };
        throw new Error(error ?? "Falha ao salvar");
      }
      const { processId } = (await res.json()) as { processId: string };
      router.push(`/modelagem/${processId}`);
    } catch (err) {
      console.error("[mapeamento] falha ao salvar", err);
      setErrorMsg(err instanceof Error ? err.message : "Falha ao salvar no repositório.");
      setSaving(false);
    }
  }

  if (mode === "review" && draft) {
    return (
      <ReviewView
        draft={draft}
        generating={generating}
        saving={saving}
        adjustText={adjustText}
        onAdjustChange={setAdjustText}
        onAdjust={() => adjustText.trim() && generate(adjustText.trim())}
        onBack={() => setMode("interview")}
        onSave={commit}
        errorMsg={errorMsg}
      />
    );
  }

  return (
    <div className="grid h-full grid-cols-[1.25fr_1fr] gap-5 px-8 py-6">
      {/* CHAT */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center gap-3 border-b border-border-soft px-5 py-4">
          <div className="flex h-8.5 w-8.5 items-center justify-center rounded-[10px] bg-gradient-to-br from-accent-2 to-accent">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-bold">Copilot de Mapeamento</div>
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-success-strong">
              <span className="h-1.5 w-1.5 rounded-full bg-success-strong" />
              Entrevista consultiva · Fase {phase} de 7
            </div>
          </div>
          <div className="rounded-full bg-page px-2.5 py-1 text-[11px] font-semibold text-muted">Roteiro ProcessTwin</div>
        </div>

        <div ref={chatRef} className="flex flex-1 flex-col gap-3 overflow-auto bg-slate-50/60 p-5">
          {messages.map((m, i) => (
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
          {loadingChat && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-[4px] border border-border bg-surface px-3.5 py-2.5 text-[13px] text-muted">
                Pensando…
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-border-soft px-4 py-3.5">
          {suggestion && !loadingChat && (
            <div className="flex items-center gap-2">
              <span className="flex-none text-[11px] font-semibold text-slate-400">Sugestão:</span>
              <button
                onClick={() => send(suggestion)}
                className="rounded-full border border-dashed border-accent-soft-border bg-accent-soft px-3 py-1.5 text-left text-[12px] font-semibold text-accent-hover hover:bg-indigo-100"
              >
                {suggestion}
              </button>
            </div>
          )}
          <div className="flex gap-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Responda, descreva o processo ou fale 🎤…"
              disabled={loadingChat}
              className="flex-1 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13px] outline-none focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] disabled:bg-page"
            />
            <VoiceInput value={input} onChange={setInput} disabled={loadingChat} />
            <button
              onClick={() => send()}
              disabled={loadingChat}
              className="rounded-[10px] bg-accent px-4.5 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>

      {/* GUIA DE FASES + GERAR */}
      <div className="flex min-h-0 flex-col gap-4 overflow-auto">
        <div className="rounded-2xl border border-border bg-surface px-6 py-5.5 shadow-sm">
          <div className="text-[13px] font-bold tracking-[.06em] text-muted uppercase">Roteiro da entrevista</div>
          <div className="mt-4 flex flex-col gap-1">
            {PHASES.map((p, i) => {
              const n = i + 1;
              const done = n < phase;
              const current = n === phase;
              return (
                <div key={p} className="flex items-center gap-3 py-1.5">
                  <span
                    className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold ${
                      done
                        ? "bg-success text-white"
                        : current
                          ? "bg-accent text-white"
                          : "bg-page text-slate-400"
                    }`}
                  >
                    {done ? "✓" : n}
                  </span>
                  <span className={`text-[12.5px] ${current ? "font-bold text-ink" : done ? "text-slate-500" : "text-slate-400"}`}>
                    {p}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-accent-soft-border bg-accent-soft px-6 py-5">
          <div className="text-[13px] font-bold text-accent-strong">Pré-mapeamento</div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
            Quando tiver o essencial (nome, gatilho, etapas com executores e sistemas), gere um rascunho do fluxo BPMN
            com atributos e recomendações — você revisa e ajusta antes de salvar.
          </p>
          <button
            onClick={() => generate()}
            disabled={generating || (!canGenerate && messages.filter((m) => m.role === "user").length < 2)}
            className="mt-4 w-full rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {generating ? "Gerando pré-mapeamento…" : "Gerar pré-mapeamento"}
          </button>
          {!canGenerate && (
            <p className="mt-2 text-[11px] text-slate-500">
              Continue a entrevista para um rascunho mais completo — ou gere agora com o que já foi dito.
            </p>
          )}
          {errorMsg && <p className="mt-2 text-[11.5px] font-semibold text-danger-strong">{errorMsg}</p>}
        </div>
      </div>
    </div>
  );
}

// ---------- Review mode ----------

const criticalityLabel: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

function ReviewView({
  draft,
  generating,
  saving,
  adjustText,
  onAdjustChange,
  onAdjust,
  onBack,
  onSave,
  errorMsg,
}: {
  draft: PreMapping;
  generating: boolean;
  saving: boolean;
  adjustText: string;
  onAdjustChange: (v: string) => void;
  onAdjust: () => void;
  onBack: () => void;
  onSave: () => void;
  errorMsg: string | null;
}) {
  const attrs: { label: string; value?: string }[] = [
    { label: "Dono", value: draft.process.owner },
    { label: "Área", value: draft.process.department },
    { label: "Criticidade", value: draft.process.criticality ? criticalityLabel[draft.process.criticality] : undefined },
    { label: "Gatilho", value: draft.process.trigger },
    { label: "Saídas", value: draft.process.outputs },
    { label: "Frequência", value: draft.process.frequency },
    { label: "SLA", value: draft.process.sla },
    { label: "Uso de IA", value: draft.process.usesAI ? draft.process.aiDetail || "Sim" : undefined },
    { label: "ESG", value: draft.process.esgTags?.length ? draft.process.esgTags.join(" · ") : undefined },
  ].filter((a) => a.value);

  return (
    <div className="grid h-full grid-cols-[1.35fr_1fr] gap-5 px-8 py-6">
      {/* PREVIEW DO FLUXO */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="m-0 text-[18px] font-bold tracking-tight">{draft.process.name}</h1>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent-hover">
                PRÉ-MAPEAMENTO IA
              </span>
            </div>
            {draft.process.objective && (
              <p className="mt-0.5 max-w-[60ch] text-[12px] text-muted">{draft.process.objective}</p>
            )}
          </div>
          <button onClick={onBack} className="rounded-[9px] border border-border px-3 py-2 text-[12px] font-semibold text-muted hover:bg-page">
            ← Voltar à entrevista
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-slate-50/60 shadow-sm">
          <PreMappingPreview preMapping={draft} />
        </div>
        <p className="text-[11.5px] text-slate-500">
          Rascunho gerado pela IA. Revise ao lado, peça ajustes ou salve — no modelador você refina posições, atributos e conexões.
        </p>
      </div>

      {/* PAINEL DE VALIDAÇÃO */}
      <div className="flex min-h-0 flex-col gap-4 overflow-auto">
        <div className="rounded-2xl border border-border bg-surface px-5 py-4.5 shadow-sm">
          <div className="text-[12px] font-bold tracking-[.06em] text-muted uppercase">Atributos</div>
          <div className="mt-3 flex flex-col gap-0.5">
            {attrs.length === 0 && <div className="text-[12px] text-slate-400">Nenhum atributo extraído ainda.</div>}
            {attrs.map((a) => (
              <div key={a.label} className="flex items-start justify-between gap-4 border-b border-border-soft py-2 last:border-b-0">
                <span className="flex-none text-[12px] font-semibold text-muted">{a.label}</span>
                <span className="text-right text-[12.5px] font-semibold text-ink">{a.value}</span>
              </div>
            ))}
          </div>
        </div>

        {draft.systems.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface px-5 py-4.5 shadow-sm">
            <div className="text-[12px] font-bold tracking-[.06em] text-muted uppercase">Sistemas</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {draft.systems.map((s) => (
                <span
                  key={s.name}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    s.isPrimary ? "bg-accent-soft text-accent" : "bg-page text-slate-500"
                  }`}
                >
                  {s.name}
                  {s.isPrimary ? " · principal" : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {draft.recommendations.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface px-5 py-4.5 shadow-sm">
            <div className="text-[12px] font-bold tracking-[.06em] text-muted uppercase">Recomendações de melhoria</div>
            <div className="mt-3 flex flex-col gap-2.5">
              {draft.recommendations.map((r, i) => (
                <div key={i} className="flex gap-2.5">
                  {r.priority && (
                    <span
                      className={`mt-0.5 flex-none rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        r.priority === "P1"
                          ? "bg-success-soft text-success-strong"
                          : r.priority === "P2"
                            ? "bg-warning-soft text-warning-text"
                            : "bg-page text-slate-500"
                      }`}
                    >
                      {r.priority}
                    </span>
                  )}
                  <div>
                    <div className="text-[12.5px] font-semibold text-slate-800">{r.title}</div>
                    {r.detail && <div className="text-[11.5px] text-muted">{r.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-surface px-5 py-4.5 shadow-sm">
          <div className="text-[12px] font-bold tracking-[.06em] text-muted uppercase">Pedir ajuste à IA</div>
          <textarea
            value={adjustText}
            onChange={(e) => onAdjustChange(e.target.value)}
            placeholder="Ex.: adiciona uma etapa de conferência antes da aprovação; o executor da triagem é o time de RH…"
            rows={3}
            disabled={generating}
            className="mt-2.5 w-full resize-none rounded-[10px] border border-border bg-page px-3 py-2.5 text-[12.5px] outline-none focus:border-indigo-400 disabled:opacity-60"
          />
          <button
            onClick={onAdjust}
            disabled={generating || !adjustText.trim()}
            className="mt-2 w-full rounded-[10px] border border-accent-soft-border bg-accent-soft px-4 py-2 text-[12.5px] font-bold text-accent-hover hover:bg-indigo-100 disabled:opacity-40"
          >
            {generating ? "Regerando…" : "Aplicar ajuste"}
          </button>
        </div>

        {errorMsg && <div className="text-[12px] font-semibold text-danger-strong">{errorMsg}</div>}

        <button
          onClick={onSave}
          disabled={saving || generating}
          className="rounded-[10px] bg-success-strong px-4 py-3 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar no repositório e abrir no modelador"}
        </button>
      </div>
    </div>
  );
}
