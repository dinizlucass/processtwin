"use client";

import { useEffect, useRef, useState } from "react";
import { chatScript, fieldDefs, type ProcessField } from "@/lib/copilot-script";

interface Message {
  role: "ai" | "user";
  text: string;
}

export default function MapeamentoPage() {
  const [messages, setMessages] = useState<Message[]>([{ role: "ai", text: chatScript[0].q }]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<Record<ProcessField, string>>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const conversationId = useRef<string | null>(null);

  async function persistConversation(msgs: Message[], ans: Partial<Record<ProcessField, string>>, status: string, processId?: string) {
    try {
      const res = await fetch("/api/ai-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conversationId.current, messages: msgs, extractedFields: ans, status, processId }),
      });
      const { id } = (await res.json()) as { id: string };
      conversationId.current = id;
    } catch (err) {
      console.error("[mapeamento] falha ao salvar conversa", err);
    }
  }

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const done = step >= chatScript.length;
  const cur = chatScript[step];
  const filled = fieldDefs.filter((f) => answers[f.key]).length;
  const pct = Math.round((filled / fieldDefs.length) * 100);

  async function send(rawText?: string) {
    if (loading || done) return;
    const text = (rawText ?? input).trim();
    if (!text) return;

    const afterUser = [...messages, { role: "user" as const, text }];
    setMessages(afterUser);
    setInput("");
    setLoading(true);

    let value = text;
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: cur.field, question: cur.q, answer: text }),
      });
      ({ value } = (await res.json()) as { value: string });
    } catch {
      // mantém o texto cru se a extração falhar
    }

    const newAnswers = { ...answers, [cur.field]: value };
    setAnswers(newAnswers);

    const next = step + 1;
    const aiReply =
      next < chatScript.length
        ? chatScript[next].q
        : "Perfeito! Mapeamento concluído. Revise o card de resumo ao lado e salve o processo no repositório.";
    const afterAi = [...afterUser, { role: "ai" as const, text: aiReply }];
    setMessages(afterAi);
    setStep(next);
    setLoading(false);

    void persistConversation(afterAi, newAnswers, next >= chatScript.length ? "entrevista_concluida" : "em_andamento");
  }

  async function handleSaveToRepo() {
    setSaving(true);
    try {
      const res = await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { processId, code } = (await res.json()) as { processId: string; code: string };
      await persistConversation(messages, answers, "concluida", processId);
      setSavedCode(code);
      setSaved(true);
    } catch (err) {
      console.error("[mapeamento] falha ao salvar processo", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid h-full grid-cols-[1.25fr_1fr] gap-5 px-8 py-6">
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
              {done ? "Entrevista concluída" : "Entrevista guiada em andamento"}
            </div>
          </div>
          <div className="rounded-full bg-page px-2.5 py-1 text-[11px] font-semibold text-muted">Roteiro padrão v2</div>
        </div>

        <div ref={chatRef} className="flex flex-1 flex-col gap-3 overflow-auto bg-slate-50/60 p-5">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-[4px] bg-accent text-white"
                    : "rounded-bl-[4px] border border-border bg-surface text-slate-800"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-[4px] border border-border bg-surface px-3.5 py-2.5 text-[13px] text-muted">
                Estruturando resposta…
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-border-soft px-4 py-3.5">
          {!done && (
            <div className="flex items-center gap-2">
              <span className="flex-none text-[11px] font-semibold text-slate-400">Sugestão:</span>
              <button
                onClick={() => send(cur.suggest)}
                className="rounded-full border border-dashed border-accent-soft-border bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent-hover hover:bg-indigo-100"
              >
                {cur.suggest}
              </button>
            </div>
          )}
          <div className="flex gap-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={done ? "Mapeamento concluído" : cur.ph}
              disabled={done || loading}
              className="flex-1 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13px] outline-none focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] disabled:bg-page"
            />
            <button
              onClick={() => send()}
              disabled={done || loading}
              className="rounded-[10px] bg-accent px-4.5 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-4 overflow-auto">
        <div className="rounded-2xl border border-border bg-surface px-6 py-5.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-bold tracking-[.06em] text-muted uppercase">Card de Resumo</div>
            <span className="text-[11px] font-bold text-accent">{pct}% completo</span>
          </div>
          <div className="my-3 h-1.5 overflow-hidden rounded-full bg-page">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-2 to-accent transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            {fieldDefs.map((f) => {
              const v = answers[f.key];
              return (
                <div key={f.key} className="flex items-center justify-between gap-4 border-b border-border-soft py-2.5">
                  <span className="flex-none text-[12px] font-semibold text-muted">{f.label}</span>
                  <span className={`text-right text-[12.5px] ${v ? "font-semibold text-ink" : "font-medium text-slate-300"}`}>
                    {v || "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {done && (
          <div className="flex items-center gap-3 rounded-[14px] border border-success-border bg-success-soft px-4.5 py-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12l3 3 5-6" />
            </svg>
            <div className="flex-1 text-[12.5px] font-semibold text-emerald-800">
              {saved
                ? `Salvo no repositório como ${savedCode} (rascunho para revisão).`
                : "Mapeamento concluído. Revise os atributos e publique."}
            </div>
            {!saved && (
              <button
                onClick={handleSaveToRepo}
                disabled={saving}
                className="rounded-[9px] bg-success-strong px-3.5 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar no Repositório"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
