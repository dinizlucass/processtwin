"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ModelingCanvas, type FlowSavePayload, type ModelingCanvasHandle } from "@/components/flow/ModelingCanvas";
import { VoiceInput } from "@/components/voice/VoiceInput";
import type { PreMapping } from "@/lib/premapping";
import { editorFlowToPreMapping, preMappingToEditorFlow } from "@/lib/draft-flow";
import {
  PHASES,
  coverageFromFacts,
  coverageProgress,
  coverageReady,
  firstOpenPhaseNumber,
  mergeCoverage,
  type Coverage,
  type ExtractedFacts,
} from "@/lib/phases";

interface Message {
  role: "ai" | "user";
  text: string;
}

interface ResumableConv {
  id: string;
  title: string;
  status: string;
  userMessageCount: number;
  updatedAt: string;
  processId: string | null;
}

function relativeWhen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
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
  const [draftKey, setDraftKey] = useState(0); // muda a cada geração → reseeda o editor
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [resumedFrom, setResumedFrom] = useState<string | null>(null); // título da conversa retomada
  const [recentConvs, setRecentConvs] = useState<ResumableConv[]>([]);
  const [showRecent, setShowRecent] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);
  const conversationId = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgInputRef = useRef<HTMLTextAreaElement>(null);

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

  // Retoma uma conversa salva: recarrega mensagens + fatos e recalcula a fase/cobertura
  // a partir dos fatos (mesma fonte que o Copilot usa), então a entrevista continua de onde parou.
  async function loadConversation(id: string) {
    try {
      const res = await fetch(`/api/ai-conversation?id=${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        id: string;
        title: string;
        messages: Message[];
        extractedFields: ExtractedFacts | null;
        status: string;
      };
      const msgs = (data.messages ?? []).filter((m) => m && typeof m.text === "string");
      conversationId.current = data.id;
      const loadedFacts = data.extractedFields && Object.keys(data.extractedFields).length ? data.extractedFields : null;
      const seeded = coverageFromFacts(loadedFacts);
      setFacts(loadedFacts);
      setCoverage(seeded);
      setMessages(msgs.length ? msgs : [{ role: "ai", text: OPENING }]);
      setPhase(firstOpenPhaseNumber(seeded));
      const userTurns = msgs.filter((m) => m.role === "user").length;
      setCanGenerate(coverageReady(seeded) || userTurns >= 2);
      setSuggestions([]);
      setResumedFrom(data.title || "conversa anterior");
      setStartMode("chat");
      // mantém o id na URL para que um refresh continue retomando a mesma conversa
      if (typeof window !== "undefined") window.history.replaceState(null, "", `/mapeamento?c=${data.id}`);
    } catch (err) {
      console.error("[mapeamento] falha ao retomar conversa", err);
    }
  }

  // No mount: se veio ?c=<id>, retoma direto; senão, busca conversas recentes
  // para oferecer "continuar de onde parou" na tela de seleção.
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get("c");
    if (cid) {
      void loadConversation(cid);
      return;
    }
    fetch("/api/ai-conversation")
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d: { conversations: ResumableConv[] }) => setRecentConvs(d.conversations ?? []))
      .catch(() => setRecentConvs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startFresh() {
    conversationId.current = null;
    setResumedFrom(null);
    setMessages([{ role: "ai", text: OPENING }]);
    setFacts(null);
    setCoverage(null);
    setPhase(1);
    setCanGenerate(false);
    setSuggestions(["Admissão de Colaboradores — garante contratação em conformidade"]);
    setStartMode("chat");
    if (typeof window !== "undefined") window.history.replaceState(null, "", "/mapeamento");
  }

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
      setDraftKey((k) => k + 1); // reseeda o editor com o novo rascunho
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

  // Ajuste da IA sobre o fluxo que está NA TELA: converte o fluxo atual do
  // editor (inclui edições manuais) em PreMapping e pede à IA para aplicar a
  // alteração, mantendo o resto coerente. Reseeda o editor com o resultado.
  async function adjustFlow(instruction: string, current: FlowSavePayload) {
    if (!draft || !instruction.trim()) return;
    setGenerating(true);
    setErrorMsg(null);
    try {
      const currentDraft = editorFlowToPreMapping(current.nodes, current.edges, draft);
      const res = await fetch("/api/copilot/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, adjustment: instruction.trim(), previousDraft: currentDraft, facts, coverage }),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string };
        throw new Error(error ?? "Falha ao ajustar");
      }
      const { draft: newDraft } = (await res.json()) as { draft: PreMapping };
      setDraft(newDraft);
      setDraftKey((k) => k + 1); // reseeda o editor com o fluxo ajustado
      setAdjustText("");
    } catch (err) {
      console.error("[mapeamento] falha ao ajustar o fluxo", err);
      setErrorMsg(err instanceof Error ? err.message : "Falha ao ajustar o fluxo.");
    } finally {
      setGenerating(false);
    }
  }

  // Salva a partir do editor completo do pré-mapeamento: cria o processo
  // (atributos, sistemas, recomendações) e grava o fluxo EDITADO por cima,
  // preservando posições/raias, e abre o modelador. Reaproveita os endpoints
  // existentes — sem mudança de backend.
  async function commitFromEditor(payload: FlowSavePayload) {
    if (!draft) return;
    setErrorMsg(null);
    try {
      const res = await fetch("/api/mapping/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, conversationId: conversationId.current }),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string };
        throw new Error(error ?? "Falha ao criar o processo");
      }
      const { processId } = (await res.json()) as { processId: string };

      const flowRes = await fetch("/api/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId, ...payload }),
      });
      if (!flowRes.ok) throw new Error(await flowRes.text());

      router.push(`/modelagem/${processId}`);
    } catch (err) {
      console.error("[mapeamento] falha ao salvar", err);
      setErrorMsg(err instanceof Error ? err.message : "Falha ao salvar no repositório.");
      throw err; // deixa o botão do editor mostrar o estado de erro
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
      const seeded = coverageFromFacts(data.facts ?? null);
      setFacts(data.facts ?? null);
      setCoverage(seeded);
      setSuggestions([]);
      setMessages([{ role: "ai", text: introMessage }]);
      // Fase atual vem da MESMA fonte que gera a % (a cobertura), então o
      // ponteiro e o percentual não se contradizem. fase_inicial é só fallback.
      setPhase(firstOpenPhaseNumber(seeded, data.fase_inicial));

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
        draftKey={draftKey}
        generating={generating}
        adjustText={adjustText}
        onAdjustChange={setAdjustText}
        onAdjustFlow={adjustFlow}
        onBack={() => setMode("interview")}
        onSaveFlow={commitFromEditor}
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
              Online
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
                onClick={startFresh}
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

            {/* CONTINUAR DE ONDE PAROU — discreto: um botão que revela as recentes */}
            {recentConvs.length > 0 && (
              <div className="mt-7 flex w-full max-w-[500px] flex-col items-center">
                <button
                  onClick={() => setShowRecent((v) => !v)}
                  className="flex items-center gap-2 rounded-full border border-border bg-surface/80 px-4 py-2 text-[12px] font-semibold text-slate-500 shadow-sm transition-all hover:border-accent-soft-border hover:text-accent-hover hover:shadow"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 8v4l3 2" /><path d="M3.05 11a9 9 0 1 1 .5 4" /><path d="M3 21v-5h5" />
                  </svg>
                  {showRecent ? "Ocultar conversas anteriores" : "Ver conversas anteriores"}
                  <svg
                    width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform duration-300 ${showRecent ? "rotate-180" : ""}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {/* reveal suave: altura + opacidade + leve subida (estilo inline p/ não depender do JIT) */}
                <div
                  style={{
                    width: "100%",
                    overflow: "hidden",
                    maxHeight: showRecent ? 360 : 0,
                    opacity: showRecent ? 1 : 0,
                    transform: showRecent ? "translateY(0)" : "translateY(-6px)",
                    transition: "max-height .34s ease, opacity .28s ease, transform .3s ease",
                  }}
                >
                  <div className="pt-3">
                    <div className="flex flex-col gap-2">
                      {recentConvs.slice(0, 3).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => loadConversation(c.id)}
                          disabled={isUploading}
                          tabIndex={showRecent ? 0 : -1}
                          className="group flex items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-2.5 text-left transition-colors hover:border-accent-soft-border hover:bg-accent-soft/50 disabled:opacity-50"
                        >
                          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-accent-soft text-accent">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 8v4l3 2" /><path d="M3.05 11a9 9 0 1 1 .5 4" /><path d="M3 21v-5h5" />
                            </svg>
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-semibold text-slate-700">{c.title}</div>
                            <div className="text-[11px] text-slate-400">
                              {c.userMessageCount} {c.userMessageCount === 1 ? "resposta" : "respostas"} · {relativeWhen(c.updatedAt)}
                            </div>
                          </div>
                          <span className="flex-none text-[12px] font-bold text-accent opacity-0 transition-opacity group-hover:opacity-100">
                            Continuar →
                          </span>
                        </button>
                      ))}
                      <a href="/conversas" className="mt-0.5 text-center text-[11.5px] font-semibold text-slate-400 hover:text-accent">
                        Ver histórico completo →
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* CORPO DO CHAT */
          <>
            {resumedFrom && (
              <div className="flex items-center gap-2 border-b border-accent-soft-border bg-accent-soft px-5 py-2 text-[11.5px] text-accent-hover">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v4l3 2" /><path d="M3.05 11a9 9 0 1 1 .5 4" /><path d="M3 21v-5h5" />
                </svg>
                <span className="flex-1">
                  Retomando <b>{resumedFrom}</b> — continue de onde parou.
                </span>
                <button onClick={startFresh} className="flex-none font-semibold text-accent hover:underline">
                  Começar nova
                </button>
              </div>
            )}
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
                <textarea
                  ref={msgInputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder="Escreva sua mensagem"
                  disabled={loadingChat}
                  className="flex-1 resize-y max-h-48 min-h-[42px] rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed outline-none focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] disabled:bg-page"
                />
                <VoiceInput value={input} onChange={setInput} disabled={loadingChat} onSend={() => send()} inputRef={msgInputRef} />
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
            onClick={() => (draft ? setMode("review") : generate())}
            disabled={generating || (!draft && !canGenerate && messages.filter((m) => m.role === "user").length < 2)}
            className="mt-4 w-full rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {generating ? "Gerando pré-mapeamento…" : draft ? "Voltar ao pré-mapeamento" : "Gerar pré-mapeamento"}
          </button>
          {draft ? (
            <button
              onClick={() => generate()}
              disabled={generating}
              className="mt-2 w-full rounded-[10px] border border-accent-soft-border px-4 py-2 text-[12px] font-semibold text-accent-hover hover:bg-accent-soft/60 disabled:opacity-40"
            >
              Gerar de novo com a conversa atual
            </button>
          ) : (
            !canGenerate && (
              <p className="mt-2 text-[11px] text-slate-500">
                Continue a entrevista para um rascunho mais completo — ou gere agora com o que já foi dito.
              </p>
            )
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
  draftKey,
  generating,
  adjustText,
  onAdjustChange,
  onAdjustFlow,
  onBack,
  onSaveFlow,
  errorMsg,
}: {
  draft: PreMapping;
  draftKey: number;
  generating: boolean;
  adjustText: string;
  onAdjustChange: (v: string) => void;
  onAdjustFlow: (instruction: string, current: FlowSavePayload) => Promise<void>;
  onBack: () => void;
  onSaveFlow: (payload: FlowSavePayload) => Promise<void>;
  errorMsg: string | null;
}) {
  // Semeia o editor do rascunho; recompõe quando um novo rascunho é gerado.
  const editorFlow = useMemo(() => preMappingToEditorFlow(draft), [draft]);
  const [showAI, setShowAI] = useState(false);
  const canvasRef = useRef<ModelingCanvasHandle>(null);

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

  // Captura o fluxo ATUAL da tela e pede o ajuste à IA.
  function requestAdjust() {
    if (generating || !adjustText.trim()) return;
    const current = canvasRef.current?.getCurrentFlow();
    if (!current) return;
    void onAdjustFlow(adjustText, current);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        {/* Editor COMPLETO — mesmas funcionalidades da modelagem manual */}
        <ModelingCanvas
          ref={canvasRef}
          key={draftKey}
          processName={draft.process.name}
          initialVersion={1}
          initialNodes={editorFlow.nodes}
          initialEdges={editorFlow.edges}
          onSave={onSaveFlow}
          saveLabel="Salvar no repositório"
          headerBadge="PRÉ-MAPEAMENTO IA"
          topBarExtra={
            <>
              <button
                onClick={onBack}
                className="rounded-[8px] border border-border px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-page"
              >
                ← Entrevista
              </button>
              <button
                onClick={() => setShowAI((v) => !v)}
                className="flex items-center gap-1 rounded-[8px] border border-accent-soft-border bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent-hover hover:bg-indigo-100"
              >
                Detalhes{draft.recommendations.length ? ` · ${draft.recommendations.length}` : ""}
              </button>
            </>
          }
        />

        {/* Painel flutuante com atributos e recomendações da IA */}
        {showAI && (
          <div className="absolute left-1/2 top-[64px] z-30 flex max-h-[calc(100%-84px)] w-80 -translate-x-1/2 flex-col overflow-auto rounded-2xl border border-border bg-surface p-4 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12px] font-bold uppercase tracking-[.06em] text-muted">Detalhes da IA</div>
              <button onClick={() => setShowAI(false)} className="text-[16px] leading-none text-slate-400 hover:text-slate-600">
                ×
              </button>
            </div>

            {attrs.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] font-bold text-muted">Atributos</div>
                <div className="mt-1.5 flex flex-col">
                  {attrs.map((a) => (
                    <div key={a.label} className="flex items-start justify-between gap-3 border-b border-border-soft py-1.5 last:border-b-0">
                      <span className="flex-none text-[11.5px] font-semibold text-muted">{a.label}</span>
                      <span className="text-right text-[11.5px] font-semibold text-ink">{a.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {draft.recommendations.length > 0 ? (
              <div>
                <div className="text-[11px] font-bold text-muted">Recomendações de melhoria</div>
                <div className="mt-1.5 flex flex-col gap-2">
                  {draft.recommendations.map((r, i) => (
                    <div key={i} className="flex gap-2">
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
                        <div className="text-[12px] font-semibold text-slate-800">{r.title}</div>
                        {r.detail && <div className="text-[11px] text-muted">{r.detail}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              attrs.length === 0 && <div className="text-[12px] text-slate-400">Sem detalhes adicionais.</div>
            )}
          </div>
        )}
      </div>

      {/* Barra de ajuste com IA — sempre visível: altera o fluxo que está na tela */}
      <div className="border-t border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex-none text-[12px] font-bold text-accent-strong">✦ Ajustar com IA</span>
          <input
            value={adjustText}
            onChange={(e) => onAdjustChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && requestAdjust()}
            placeholder="Peça uma alteração no fluxo em tela — ex.: adicione uma conferência antes da aprovação; a triagem é do RH"
            disabled={generating}
            className="flex-1 rounded-[10px] border border-border bg-page px-3.5 py-2.5 text-[13px] outline-none focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] disabled:opacity-60"
          />
          <button
            onClick={requestAdjust}
            disabled={generating || !adjustText.trim()}
            className="flex-none rounded-[10px] bg-accent px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {generating ? "Ajustando…" : "Aplicar"}
          </button>
        </div>
        {errorMsg && <div className="mt-1.5 text-[11.5px] font-semibold text-danger-strong">{errorMsg}</div>}
      </div>
    </div>
  );
}