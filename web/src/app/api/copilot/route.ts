import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { INTERVIEW_SYSTEM_PROMPT, INTERVIEW_TOOL, STATIC_INTERVIEW_QUESTIONS } from "@/lib/copilot-prompt";
import {
  buildKnownFactsBlock,
  coverageFromFacts,
  coverageReady,
  normalizeCoverage,
  normalizeMetricsFields,
  type ExtractedFacts,
  type InterviewForm,
} from "@/lib/phases";

interface ChatMessage {
  role: "ai" | "user";
  text: string;
}

interface Body {
  messages: ChatMessage[];
  facts?: ExtractedFacts | null;
}

export async function POST(req: Request) {
  const { messages, facts } = (await req.json()) as Body;
  const userTurns = messages.filter((m) => m.role === "user").length;

  // Cobertura conhecida a partir da transcrição — usada como piso nos fallbacks
  // e devolvida ao front para popular o guia mesmo sem o turno do modelo.
  const seededCoverage = coverageFromFacts(facts);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // fallback estático: percorre um roteiro reduzido
    const q = STATIC_INTERVIEW_QUESTIONS[Math.min(userTurns, STATIC_INTERVIEW_QUESTIONS.length - 1)];
    const ready = userTurns >= 3 || coverageReady(seededCoverage);
    return Response.json({
      reply: q.mensagem,
      suggestions: q.sugestao ? [q.sugestao] : [],
      phase: Math.min(userTurns + 1, 7),
      readyToGenerate: ready,
      coverage: seededCoverage,
      source: "static" as const,
    });
  }

  const client = new OpenAI({ apiKey });
  const history: ChatCompletionMessageParam[] = messages.map((m) => ({
    role: m.role === "ai" ? "assistant" : "user",
    content: m.text,
  }));

  // Injeta o que já foi extraído de uma transcrição, para o modelo não repetir
  // perguntas e mirar direto nas fases ainda em aberto.
  const factsBlock = buildKnownFactsBlock(facts);
  const systemContent = factsBlock
    ? `${INTERVIEW_SYSTEM_PROMPT}\n\n${factsBlock}`
    : INTERVIEW_SYSTEM_PROMPT;

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "system", content: systemContent }, ...history],
      tools: [INTERVIEW_TOOL],
      tool_choice: { type: "function", function: { name: "responder" } },
    });

    const call = completion.choices[0]?.message.tool_calls?.[0];
    if (call?.type === "function" && call.function?.arguments) {
      const parsed = JSON.parse(call.function.arguments) as {
        mensagem: string;
        fase_atual?: number;
        sugestoes?: unknown;
        pronto_para_gerar?: boolean;
        cobertura?: unknown;
        formulario?: { tipo?: string; campos?: unknown };
      };
      const coverage = normalizeCoverage(parsed.cobertura);
      const suggestions = Array.isArray(parsed.sugestoes)
        ? parsed.sugestoes.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 3)
        : [];
      const form: InterviewForm | null =
        parsed.formulario?.tipo === "metricas"
          ? { tipo: "metricas", campos: normalizeMetricsFields(parsed.formulario.campos) }
          : null;
      return Response.json({
        reply: parsed.mensagem,
        suggestions,
        phase: parsed.fase_atual ?? Math.min(userTurns + 1, 7),
        readyToGenerate: Boolean(parsed.pronto_para_gerar) || coverageReady(coverage),
        coverage,
        form,
        source: "openai" as const,
      });
    }
    // sem tool call: usa o texto direto
    return Response.json({
      reply: completion.choices[0]?.message.content ?? "Pode me contar mais sobre o processo?",
      suggestions: [],
      phase: Math.min(userTurns + 1, 7),
      readyToGenerate: coverageReady(seededCoverage) || userTurns >= 5,
      coverage: seededCoverage,
      source: "openai" as const,
    });
  } catch (err) {
    console.error("[copilot] falha na entrevista", err);
    const q = STATIC_INTERVIEW_QUESTIONS[Math.min(userTurns, STATIC_INTERVIEW_QUESTIONS.length - 1)];
    return Response.json({
      reply: q.mensagem,
      suggestions: q.sugestao ? [q.sugestao] : [],
      phase: Math.min(userTurns + 1, 7),
      readyToGenerate: userTurns >= 3 || coverageReady(seededCoverage),
      coverage: seededCoverage,
      source: "fallback" as const,
    });
  }
}
