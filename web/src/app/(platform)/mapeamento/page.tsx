"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PreMappingPreview } from "@/components/flow/PreMappingPreview";
import { VoiceInput } from "@/components/voice/VoiceInput";
import type { PreMapping } from "@/lib/premapping";
import {
  PHASES,
  coverageFromFacts,
  coverageProgress,
  coverageReady,
  mergeCoverage,
  type Coverage,
  type ExtractedFacts,
} from "@/lib/phases";

interface Message {
  role: "ai" | "user";
  text: string;
}

const OPENING =
  "Olá! Sou o Gênio de Processo, seu agente e ao seu dispor. Estou aqui para ajudar você a mapear, documentar e otimizar suas atividades de forma simples e rápida. \n\n Para começarmos, qual é o nome do processo que vamos estruturar hoje e qual é o principal objetivo dele?";

export default function MapeamentoPage() {
  const router = useRouter();
  const [startMode, setStartMode] = useState<"select" | "chat">("select");
  const [isUploading, setIsUploading] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([{ role: "ai", text: OPENING }]);
  const [facts, setFacts] = useState<ExtractedFacts | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([
    "Admissão de Colaboradores — garante contratação em conformidade",
  ]);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Progresso: preferimos a cobertura real (coberto/parcial) quando existe;
  // sem ela, caímos no avanço por fase.
  const coverageByKey = new Map((coverage ?? []).map((c) => [c.key, c]));
  const progressPercent = coverage && coverage.length
    ? coverageProgress(coverage)
    : Math.min(100, Math.max(0, Math.round(((phase - 1) / 7) * 100)));
  useEffect(() => {
    if (chatRef.current && startMode === "chat") {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, startMode]);

  async function persistConversation(msgs: Message[], status: string, processId?: string) {
    try {
      const res = await fetch("/api/ai-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conversationId.current, messages: msgs, extractedFields: facts ?? {}, status, processId }),
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
    setSuggestions([]);
    setLoadingChat(true);

    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: afterUser, facts }),
      });
      const data = (await res.json()) as {
        reply: string;
        suggestions?: string[];
        phase: number;
        readyToGenerate: boolean;
        coverage?: Coverage;
      };
      const afterAi = [...afterUser, { role: "ai" as const, text: data.reply }];
      setMessages(afterAi);
      setSuggestions(data.suggestions ?? []);
      setPhase(data.phase || phase);
      // Funde sem regredir: o piso da transcrição se mantém e a % só cresce.
      const mergedCoverage = mergeCoverage(coverage, data.coverage ?? null);
      setCoverage(mergedCoverage);
      setCanGenerate(data.readyToGenerate || coverageReady(mergedCoverage));
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
        body: JSON.stringify({ messages, adjustment, previousDraft: draft, facts, coverage }),
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/extract-transcript", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Falha na extração da IA.");
      }

      const data = (await res.json()) as {
        facts?: ExtractedFacts;
        fase_inicial?: number;
        mensagem_inicial?: string;
      };

      const introMessage = data.mensagem_inicial || "Documento processado! Vamos continuar o mapeamento?";

      // Guarda os fatos extraídos para injetar em TODA chamada seguinte
      // (entrevista e geração) — é o que ancora o mapeamento na transcrição.
      // A cobertura inicial já reflete o que a transcrição cobriu.
      setFacts(data.facts ?? null);
      setCoverage(coverageFromFacts(data.facts ?? null));
      setSuggestions([]);
      setMessages([{ role: "ai", text: introMessage }]);
      // Se a IA definir uma fase inicial (ex: pulou a 1 e 2), a gente já atualiza aqui!
      if (data.fase_inicial) {
        setPhase(data.fase_inicial);
      }

      setStartMode("chat");

    } catch (err) {
      console.error("[mapeamento] Erro no upload", err);
      alert("Houve um erro ao processar o arquivo. Tente novamente.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
      {/* CHAT / TELA DE SELEÇÃO INICIAL */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        
        {/* CABEÇALHO */}
        <div className="flex items-center gap-3 border-b border-border-soft px-5 py-4">
          <div className="flex h-8.5 w-8.5 items-center justify-center rounded-[10px] bg-gradient-to-br from-accent-2 to-accent">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-bold">Gênio de Processos</div>
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-success-strong">
              <span className="h-1.5 w-1.5 rounded-full bg-success-strong" />
              Entrevista consultiva
            </div>
          </div>
        </div>

        {/* TELA DE SELEÇÃO */}
        {startMode === "select" ? (
          <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/60 p-8">
            <h2 className="mb-2 text-xl font-bold text-slate-800">Como você deseja começar?</h2>
            <p className="mb-8 max-w-md text-center text-[13px] text-slate-500">
              Escolha se quer extrair dados de uma transcrição existente ou mapear o processo conversando do zero.
            </p>
            
            <div className="grid w-full max-w-[500px] grid-cols-2 gap-5">
              {/* Botão Transcrição */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="group flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border bg-surface p-6 text-center transition-all hover:border-accent hover:bg-accent-soft disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${isUploading ? 'bg-accent text-white animate-pulse' : 'bg-page text-slate-400 group-hover:bg-accent group-hover:text-white'}`}>
                  {isUploading ? (
                    <span className="text-[10px] font-bold">Lendo...</span>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                  )}
                </div>
                <div>
                  <div className="text-[14px] font-bold text-slate-800 group-hover:text-accent-strong">
                    {isUploading ? "Processando com IA..." : "Transcrição"}
                  </div>
                  <div className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
                    {isUploading ? "Isso pode levar alguns segundos." : "Suba o texto de uma reunião. A IA extrai o roteiro e pergunta só o que faltar."}
                  </div>
                </div>
              </button>
              
              <input 
                type="file" 
                accept=".txt" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileUpload}
              />

              {/* Botão Do Zero */}
              <button
                onClick={() => setStartMode("chat")}
                disabled={isUploading}
                className="group flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-surface p-6 text-center shadow-sm transition-all hover:border-accent hover:bg-accent-soft hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-sm transition-transform group-hover:scale-105">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-[14px] font-bold text-slate-800 group-hover:text-accent-strong">Bate papo com IA</div>
                  <div className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
                    Converse com o agente passo a passo para construir o fluxo.
                  </div>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* CORPO DO CHAT */
          <>
            <div ref={chatRef} className="flex flex-1 flex-col gap-3 overflow-auto bg-slate-50/60 p-5">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`whitespace-pre-wrap max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
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
              {suggestions.length > 0 && !loadingChat && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-none text-[11px] font-semibold text-slate-400">
                    {suggestions.length > 1 ? "Sugestões:" : "Sugestão:"}
                  </span>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => send(s)}
                      className="rounded-full border border-dashed border-accent-soft-border bg-accent-soft px-3 py-1.5 text-left text-[12px] font-semibold text-accent-hover hover:bg-indigo-100"
                    >
                      {s}
                    </button>
                  ))}
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
          </>
        )}
      </div>

      {/* GUIA DE FASES + GERAR */}
      <div className="flex min-h-0 flex-col gap-4 overflow-auto">
        <div className="rounded-2xl border border-border bg-surface px-6 py-5.5 shadow-sm">
          
          {/* CABEÇALHO DO GUIA COM O GRÁFICO CIRCULAR */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-[13px] font-bold tracking-[.06em] text-muted uppercase">Etapas do Mapeamento</div>
            <div className="relative flex h-10 w-10 items-center justify-center">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                <path
                  className="text-page"
                  strokeWidth="4"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-accent transition-all duration-500 ease-out"
                  strokeDasharray={`${progressPercent}, 100`}
                  strokeWidth="4"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute text-[10px] font-bold text-slate-700">{progressPercent}%</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            {PHASES.map((p) => {
              const hasCoverage = Boolean(coverage && coverage.length);
              const cov = coverageByKey.get(p.key);
              const covered = hasCoverage ? cov?.status === "coberto" : p.n < phase;
              const partial = hasCoverage ? cov?.status === "parcial" : false;
              const current = p.n === phase;
              const tip = cov?.faltando ? `Falta: ${cov.faltando}` : cov?.resumo;
              return (
                <div key={p.key} className="flex items-center gap-3 py-1.5" title={tip}>
                  <span
                    className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold ${
                      covered
                        ? "bg-success text-white"
                        : current
                          ? "bg-accent text-white"
                          : partial
                            ? "bg-warning-soft text-warning-text"
                            : "bg-page text-slate-400"
                    }`}
                  >
                    {covered ? "✓" : p.n}
                  </span>
                  <span
                    className={`text-[12.5px] ${
                      current
                        ? "font-bold text-ink"
                        : covered
                          ? "text-slate-500"
                          : partial
                            ? "text-ink"
                            : "text-slate-400"
                    }`}
                  >
                    {p.label}
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