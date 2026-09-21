"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Source = { id: string; name: string; href: string; version: number | null };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[]; asOf?: string; scope?: string };

const SUGGESTIONS = [
  { title: "Panorama", question: "Quantos processos publicados estão mapeados?" },
  { title: "Prioridades", question: "Quais processos críticos estão no repositório?" },
  { title: "Sistemas", question: "Quais processos usam SAP?" },
  { title: "Conexões", question: "Quais processos se relacionam entre si?" },
];

function SparkleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z"/><path d="m19 17 .7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z"/></svg>;
}

export default function ProcessAssistantPage() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  async function ask(value = draft) {
    const question = value.trim();
    if (!question || busy) return;
    setError("");
    setDraft("");
    setBusy(true);
    const prior = messages.slice(-4).map((m) => ({ role: m.role, content: m.content }));
    setMessages((old) => [...old, { role: "user", content: question }]);
    try {
      const res = await fetch("/api/process-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: prior }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao consultar o assistente.");
      setMessages((old) => [...old, { role: "assistant", content: data.answer, sources: data.sources, asOf: data.asOf, scope: data.scope }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada.");
      setDraft(question);
      setMessages((old) => old.slice(0, -1));
    } finally { setBusy(false); }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f8faff]">
      <header className="shrink-0 border-b border-slate-200/80 bg-white/90 px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-[860px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm shadow-indigo-200"><SparkleIcon /></div>
            <div className="min-w-0">
              <h1 className="truncate text-[16px] font-bold tracking-tight text-slate-900">Assistente de processos</h1>
              <p className="truncate text-[11px] text-slate-500">Respostas fundamentadas no repositório</p>
            </div>
          </div>
          {messages.length > 0 && <button type="button" disabled={busy} onClick={() => { setMessages([]); setDraft(""); setError(""); inputRef.current?.focus(); }} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">Nova conversa</button>}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-7 sm:px-8" aria-live="polite">
        <div className="mx-auto flex min-h-full max-w-[860px] flex-col">
          {messages.length === 0 ? <div className="my-auto py-8 sm:py-14">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-[20px] bg-indigo-600 text-white shadow-lg shadow-indigo-200"><SparkleIcon className="h-7 w-7" /></div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-indigo-600">Explore seu repositório</div>
            <h2 className="max-w-[620px] text-[30px] font-bold leading-[1.15] tracking-[-.035em] text-slate-950 sm:text-[38px]">O que você quer saber sobre seus processos?</h2>
            <p className="mt-4 max-w-[560px] text-[14px] leading-6 text-slate-600">Pergunte sobre fluxos, responsáveis, sistemas, conexões e indicadores de mapeamento. Cada resposta mostra de onde veio a informação.</p>
            <div className="mt-9 grid gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => <button key={s.title} type="button" onClick={() => ask(s.question)} disabled={busy} className="group flex min-h-24 flex-col items-start justify-center rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50"><span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">{s.title}</span><span className="mt-2 text-[13px] font-medium leading-5 text-slate-800">{s.question}</span></button>)}
            </div>
          </div> : <div className="flex flex-col gap-7 pb-5">
            {messages.map((m, i) => <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"><SparkleIcon className="h-4 w-4" /></div>}
              <div className={m.role === "user" ? "max-w-[85%] rounded-2xl rounded-tr-md bg-indigo-600 px-4 py-3 text-[13px] leading-6 text-white shadow-sm sm:max-w-[72%]" : "min-w-0 max-w-[760px] flex-1 pt-1"}>
                {m.role === "assistant" && <div className="mb-2 text-[12px] font-bold text-slate-900">Assistente</div>}
                <div className={`whitespace-pre-wrap break-words text-[13px] leading-6 ${m.role === "assistant" ? "text-slate-800" : "text-white"}`}>{m.content}</div>
                {m.role === "assistant" && <>
                  {!!m.sources?.length && <div className="mt-4 flex flex-wrap items-center gap-2"><span className="mr-1 text-[11px] font-medium text-slate-500">Fontes</span>{m.sources.map((s) => <Link key={s.id} href={s.href} className="rounded-full border border-indigo-100 bg-white px-3 py-1 text-[11px] font-medium text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">{s.name}{s.version != null ? ` · v${s.version}` : ""}</Link>)}</div>}
                  {(m.scope || m.asOf) && <div className="mt-3 text-[10px] leading-4 text-slate-500">{m.scope}{m.asOf ? ` · ${new Date(m.asOf).toLocaleString("pt-BR")}` : ""}</div>}
                </>}
              </div>
            </div>)}
            {busy && <div className="flex items-center gap-3 text-[12px] text-slate-500"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white"><SparkleIcon className="h-4 w-4" /></div><span>Consultando processos<span className="animate-pulse">...</span></span></div>}
          </div>}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200/80 bg-white px-4 pb-4 pt-3 sm:px-8">
        <div className="mx-auto max-w-[860px]">
          {error && <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-700">{error}</div>}
          <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
            <textarea ref={inputRef} aria-label="Pergunta sobre processos" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }} rows={2} maxLength={1000} placeholder="Pergunte sobre seus processos..." className="max-h-36 min-h-12 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-[13px] leading-5 text-slate-900 outline-none placeholder:text-slate-400" />
            <button type="submit" aria-label="Enviar pergunta" disabled={!draft.trim() || busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v14" /></svg></button>
          </form>
          <p className="mt-2 text-center text-[10px] leading-4 text-slate-500">Baseado nos processos publicados. Indicadores de execução real dependem de integração com os sistemas.</p>
        </div>
      </div>
    </div>
  );
}
