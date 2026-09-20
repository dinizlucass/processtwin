import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { INTERVIEW_SYSTEM_PROMPT, INTERVIEW_TOOL } from "@/lib/copilot-prompt";
import { mappingInterviewOptions } from "@/lib/ai-models";
import {
  buildKnownFactsBlock,
  coverageFromFacts,
  coverageReady,
  mergeCoverage,
  normalizeCoverage,
  type ExtractedFacts,
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
    return Response.json({ error: "OPENAI_API_KEY não configurada. A entrevista com IA está indisponível." }, { status: 503 });
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
      ...mappingInterviewOptions(Boolean(facts?.sourceTranscript)),
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
        pendencia_critica?: string;
        cobertura?: unknown;
      };
      const coverage = mergeCoverage(seededCoverage, normalizeCoverage(parsed.cobertura));
      const ready = (Boolean(parsed.pronto_para_gerar) || coverageReady(coverage)) && !parsed.pendencia_critica?.trim();
      return Response.json({
        reply: ready
          ? "Já tenho o suficiente para um primeiro rascunho. As lacunas ficarão sinalizadas para revisão; você pode gerar agora ou acrescentar mais detalhes."
          : parsed.mensagem,
        suggestions: ready ? [] : ["Não sei informar"],
        phase: parsed.fase_atual ?? Math.min(userTurns + 1, 7),
        readyToGenerate: ready,
        coverage,
        source: "openai" as const,
      });
    }
    throw new Error("A entrevista não retornou a estrutura esperada.");
  } catch (err) {
    console.error("[copilot] falha na entrevista", err);
    return Response.json({ error: "A entrevista com IA falhou. Tente novamente; suas respostas foram preservadas." }, { status: 502 });
  }
}
