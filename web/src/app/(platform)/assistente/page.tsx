"use client";

import Link from "next/link";
import { useState } from "react";

type Source = { id: string; name: string; href: string; version: number | null };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[]; asOf?: string; scope?: string };

const SUGGESTIONS = [
  "Quantos processos publicados estão mapeados?",
  "Quais processos críticos estão no repositório?",
  "Quais processos usam SAP?",
  "Quais processos se relacionam entre si?",
];

export default function ProcessAssistantPage() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    <div className="mx-auto flex max-w-[980px] flex-col gap-5 px-8 py-7">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[.13em] text-accent">IA de processos · piloto</div>
        <h1 className="mt-1 text-[23px] font-bold tracking-tight">Pergunte aos processos</h1>
        <p className="mt-1 text-[13px] text-muted">Respostas com fontes sobre processos publicados, atividades, relações confirmadas e KPIs de mapeamento.</p>
      </div>

      {messages.length === 0 && <div className="grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} disabled={busy} className="rounded-xl border border-border bg-surface px-4 py-3 text-left text-[13px] hover:border-accent disabled:opacity-50">{s}</button>)}
      </div>}

      <div aria-live="polite" className="flex flex-col gap-3">
        {messages.map((m, i) => <div key={i} className={`rounded-[14px] border p-4 ${m.role === "user" ? "ml-10 border-accent/20 bg-accent/5" : "mr-5 border-border bg-surface"}`}>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">{m.role === "user" ? "Você" : "Assistente"}</div>
          <div className="whitespace-pre-wrap text-[13px] leading-6 text-slate-800">{m.content}</div>
          {m.role === "assistant" && <>
            {!!m.sources?.length && <div className="mt-3 border-t border-border-soft pt-3">
              <div className="text-[11px] font-bold text-muted">Fontes consultadas</div>
              <div className="mt-1 flex flex-wrap gap-2">{m.sources.map((s) => <Link key={s.id} href={s.href} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-accent hover:underline">[{s.id}] {s.name}{s.version != null ? ` · v${s.version}` : ""}</Link>)}</div>
            </div>}
            <div className="mt-2 text-[10px] text-muted">{m.scope}{m.asOf ? ` · Consultado em ${new Date(m.asOf).toLocaleString("pt-BR")}` : ""}</div>
          </>}
        </div>)}
        {busy && <div className="text-[12px] text-muted">Consultando processos...</div>}
      </div>

      {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
      <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2">
        <input aria-label="Pergunta sobre processos" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} placeholder="Pergunte sobre processos, responsáveis, sistemas ou KPIs..." className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-[13px] outline-none focus:border-accent" />
        <button type="submit" disabled={!draft.trim() || busy} className="rounded-xl bg-accent px-5 py-3 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50">Perguntar</button>
      </form>
      <p className="text-[11px] text-muted">Indicadores operacionais reais, como tempo médio ou volume executado, dependem de integração com dados de execução.</p>
    </div>
  );
}
