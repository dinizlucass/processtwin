import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { GENERATION_SYSTEM_PROMPT, GENERATION_TOOL } from "@/lib/copilot-prompt";
import { sanitizePreMapping, type PreMapping } from "@/lib/premapping";
import { buildCoverageDigest, buildKnownFactsBlock, type Coverage, type ExtractedFacts } from "@/lib/phases";

interface ChatMessage {
  role: "ai" | "user";
  text: string;
}

interface Body {
  messages: ChatMessage[];
  adjustment?: string;
  previousDraft?: PreMapping;
  facts?: ExtractedFacts | null;
  coverage?: Coverage | null;
}

export async function POST(req: Request) {
  const { messages, adjustment, previousDraft, facts, coverage } = (await req.json()) as Body;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY não configurada — necessária para gerar o pré-mapeamento." },
      { status: 400 },
    );
  }

  const client = new OpenAI({ apiKey });

  const transcript = messages
    .map((m) => `${m.role === "ai" ? "Entrevistador" : "Usuário"}: ${m.text}`)
    .join("\n");

  // Duas âncoras: os fatos crus da transcrição (quando o mapeamento começou por
  // upload) e a síntese por fase consolidada da conversa. Juntas deixam a
  // geração fiel ao que foi realmente dito, em vez de inferir do nada.
  const factsBlock = buildKnownFactsBlock(facts);
  const coverageDigest = buildCoverageDigest(coverage);
  const anchors = [factsBlock, coverageDigest].filter(Boolean).join("\n\n");
  const anchorSection = anchors ? `${anchors}\n\n` : "";

  const userContent = adjustment
    ? `${anchorSection}Transcrição da entrevista:\n${transcript}\n\nPré-mapeamento anterior (JSON):\n${JSON.stringify(
        previousDraft,
      )}\n\nAjuste solicitado pelo usuário: "${adjustment}"\n\nGere o pré-mapeamento revisado aplicando esse ajuste e mantendo o resto coerente.`
    : `${anchorSection}Transcrição da entrevista:\n${transcript}\n\nGere o pré-mapeamento estruturado do processo.`;

  const history: ChatCompletionMessageParam[] = [
    { role: "system", content: GENERATION_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: history,
      tools: [GENERATION_TOOL],
      tool_choice: { type: "function", function: { name: "gerar_premapeamento" } },
    });

    const call = completion.choices[0]?.message.tool_calls?.[0];
    if (call?.type === "function" && call.function?.arguments) {
      const raw = JSON.parse(call.function.arguments) as Partial<PreMapping>;
      const draft = sanitizePreMapping(raw);
      return Response.json({ draft });
    }
    return Response.json({ error: "O modelo não retornou um pré-mapeamento válido." }, { status: 502 });
  } catch (err) {
    console.error("[copilot/generate] falha ao gerar pré-mapeamento", err);
    return Response.json({ error: "Falha ao gerar o pré-mapeamento. Tente novamente." }, { status: 500 });
  }
}
