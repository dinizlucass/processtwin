"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { useMicDevices } from "@/lib/useMicDevices";

export function VoiceInput({
  value,
  onChange,
  disabled,
  onSend,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onSend?: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const baseTextRef = useRef("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const { devices, selectedId, setSelectedId, permission, requestPermission } = useMicDevices();

  const { supported, listening, error, start, stop, reset } = useSpeechRecognition({
    lang: "pt-BR",
    onTranscript: (text) => {
      const base = baseTextRef.current;
      onChange(base ? `${base} ${text}` : text);
      // Mantém o campo rolado até o fim: mostra sempre as últimas falas.
      const el = inputRef?.current;
      if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
    },
  });

  const active = listening || paused;

  // Se o campo foi esvaziado enquanto grava (ex.: a mensagem foi enviada pelo
  // botão do chat), reinicia a base para a fala anterior NÃO reaparecer.
  useEffect(() => {
    if (active && value.trim() === "") {
      baseTextRef.current = "";
      reset();
    }
  }, [value, active, reset]);

  // fecha o seletor ao clicar fora
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as globalThis.Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerOpen]);

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title="Seu navegador não suporta transcrição de voz (use Chrome ou Edge)"
        className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] border border-border bg-page text-slate-300"
        aria-label="Transcrição de voz indisponível"
      >
        <MicIcon />
      </button>
    );
  }

  async function startRec() {
    if (permission !== "granted") {
      const ok = await requestPermission();
      if (!ok) return;
    }
    baseTextRef.current = value.trim();
    reset();
    setPaused(false);
    start();
  }

  function pauseRec() {
    setPaused(true);
    stop();
  }

  function resumeRec() {
    baseTextRef.current = value.trim();
    reset();
    setPaused(false);
    start();
  }

  function sendRec() {
    setPaused(false);
    stop();
    reset();
    baseTextRef.current = "";
    onSend?.();
  }

  const errorMsg =
    error === "not-allowed"
      ? "Permissão de microfone negada."
      : error === "no-speech"
        ? "Não ouvi nada — tente de novo."
        : error === "audio-capture"
          ? "Microfone não encontrado."
          : null;

  return (
    <div ref={wrapRef} className="relative flex flex-none items-center gap-1.5">
      {!active ? (
        <>
          <button
            type="button"
            onClick={startRec}
            disabled={disabled}
            aria-label="Falar para transcrever"
            title="Falar para transcrever"
            className="flex h-[42px] w-9 flex-none items-center justify-center rounded-l-[10px] border border-border bg-surface text-slate-500 transition-colors hover:border-indigo-300 hover:text-accent disabled:opacity-40"
          >
            <MicIcon />
          </button>
          <button
            type="button"
            onClick={async () => {
              const next = !pickerOpen;
              setPickerOpen(next);
              if (next && permission !== "granted") await requestPermission();
            }}
            disabled={disabled}
            aria-label="Escolher microfone"
            title="Escolher microfone"
            className="-ml-1.5 flex h-[42px] w-6 flex-none items-center justify-center rounded-r-[10px] border border-l-0 border-border bg-surface text-slate-400 hover:text-accent disabled:opacity-40"
          >
            <ChevronIcon open={pickerOpen} />
          </button>
        </>
      ) : listening ? (
        <button
          type="button"
          onClick={pauseRec}
          disabled={disabled}
          aria-label="Pausar"
          title="Pausar"
          className="flex h-[42px] w-9 flex-none items-center justify-center rounded-[10px] border border-danger bg-danger-soft text-danger-strong transition-colors disabled:opacity-40"
        >
          <PauseIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={resumeRec}
          disabled={disabled}
          aria-label="Continuar gravação"
          title="Continuar"
          className="flex h-[42px] w-9 flex-none items-center justify-center rounded-[10px] border border-accent-soft-border bg-accent-soft text-accent-hover transition-colors disabled:opacity-40"
        >
          <MicIcon />
        </button>
      )}

      {/* Envio — único botão de enviar, sempre visível (voz ou texto digitado) */}
      <button
        type="button"
        onClick={sendRec}
        disabled={disabled || !value.trim()}
        aria-label="Enviar"
        title="Enviar"
        className="flex h-[42px] w-9 flex-none items-center justify-center rounded-[10px] bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
      >
        <SendIcon />
      </button>

      {listening && (
        <span className="pointer-events-none absolute -top-6 left-0 flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-bold text-danger-strong whitespace-nowrap">
          Ouvindo…
        </span>
      )}
      {paused && !listening && (
        <span className="pointer-events-none absolute -top-6 left-0 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-bold text-warning-text whitespace-nowrap">
          Pausado
        </span>
      )}
      {errorMsg && !active && (
        <span className="pointer-events-none absolute -top-6 left-0 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning-text whitespace-nowrap">
          {errorMsg}
        </span>
      )}

      {pickerOpen && (
        <div className="absolute right-0 bottom-full z-20 mb-2 w-64 rounded-[12px] border border-border bg-surface p-2 shadow-lg">
          <div className="px-2 py-1.5 text-[10.5px] font-bold tracking-[.06em] text-muted uppercase">Microfone</div>
          {permission === "denied" && (
            <div className="px-2 py-2 text-[12px] text-danger-strong">
              Permissão negada. Libere o microfone nas configurações do navegador.
            </div>
          )}
          {permission !== "denied" && devices.length === 0 && (
            <button
              onClick={() => requestPermission()}
              className="w-full rounded-[8px] bg-accent-soft px-3 py-2 text-[12px] font-semibold text-accent-hover hover:bg-indigo-100"
            >
              Permitir e listar microfones
            </button>
          )}
          <div className="flex max-h-56 flex-col gap-0.5 overflow-auto">
            {devices.map((d, i) => {
              const id = d.deviceId;
              const isActive = selectedId ? selectedId === id : i === 0;
              return (
                <button
                  key={id || i}
                  onClick={() => {
                    setSelectedId(id);
                    setPickerOpen(false);
                  }}
                  className={`flex items-center gap-2 rounded-[8px] px-2 py-2 text-left text-[12px] ${
                    isActive ? "bg-accent-soft font-semibold text-accent-hover" : "text-slate-600 hover:bg-page"
                  }`}
                >
                  <span className={`h-2 w-2 flex-none rounded-full ${isActive ? "bg-accent" : "bg-slate-300"}`} />
                  <span className="truncate">{d.label || `Microfone ${i + 1}`}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-border-soft px-2 pt-2 pb-1 text-[10px] leading-snug text-slate-400">
            A transcrição ao vivo usa o microfone padrão do navegador.
          </div>
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
