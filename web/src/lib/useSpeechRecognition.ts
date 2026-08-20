"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Tipos mínimos da Web Speech API (não fazem parte do lib.dom padrão).
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  0: SRAlternative;
}
interface SRResultList {
  length: number;
  [index: number]: SRResult;
}
interface SREvent {
  resultIndex: number;
  results: SRResultList;
}
interface SRErrorEvent {
  error: string;
}
interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SRCtor = new () => SRInstance;

function getSpeechRecognition(): SRCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export interface UseSpeechRecognitionOptions {
  lang?: string;
  onTranscript?: (text: string) => void;
}

export function useSpeechRecognition({ lang = "pt-BR", onTranscript }: UseSpeechRecognitionOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SRInstance | null>(null);
  const finalRef = useRef("");
  const emitRef = useRef(false); // ignora onresult residual após stop (evita re-emitir a fala anterior)
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupported(!!getSpeechRecognition());
  }, []);

  const stop = useCallback(() => {
    emitRef.current = false;
    recRef.current?.stop();
  }, []);

  // Zera o texto final acumulado — usado ao (re)iniciar uma nova fala/base.
  const reset = useCallback(() => {
    finalRef.current = "";
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("unsupported");
      return;
    }
    // encerra qualquer sessão anterior
    recRef.current?.abort();

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    finalRef.current = "";
    emitRef.current = true;

    rec.onstart = () => {
      setListening(true);
      setError(null);
    };
    rec.onresult = (e: SREvent) => {
      if (!emitRef.current) return; // sessão já encerrada — não re-emite
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalRef.current += text;
        else interim += text;
      }
      const combined = (finalRef.current + interim).replace(/\s+/g, " ").trim();
      onTranscriptRef.current?.(combined);
    };
    rec.onerror = (e: SRErrorEvent) => {
      setError(e.error);
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      // start() lança se chamado durante uma sessão ativa — ignora
    }
  }, [lang]);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
    };
  }, []);

  return { supported, listening, error, start, stop, reset };
}
