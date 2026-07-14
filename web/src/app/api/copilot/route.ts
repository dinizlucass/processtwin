import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { INTERVIEW_SYSTEM_PROMPT, INTERVIEW_TOOL, STATIC_INTERVIEW_QUESTIONS } from "@/lib/copilot-prompt";

interface ChatMessage {
  role: "ai" | "user";
  text: string;
}

interface Body {
  messages: ChatMessage[];
}

export async function POST(req: Request) {
  const { messages } = (await req.json()) as Body;
  const userTurns = messages.filter((m) => m.role === "user").length;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // fallback estático: percorre um roteiro reduzido
    const q = STATIC_INTERVIEW_QUESTIONS[Math.min(userTurns, STATIC_INTERVIEW_QUESTIONS.length - 1)];
    const ready = userTurns >= 3;
    return Response.json({
      reply: q.mensagem,
      suggestion: q.sugestao,
      phase: Math.min(userTurns + 1, 7),
      readyToGenerate: ready,
      source: "static" as const,
    });
  }

  const client = new OpenAI({ apiKey });
  const history: ChatCompletionMessageParam[] = messages.map((m) => ({
    role: m.role === "ai" ? "assistant" : "user",
    content: m.text,
  }));

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "system", content: INTERVIEW_SYSTEM_PROMPT }, ...history],
      tools: [INTERVIEW_TOOL],
      tool_choice: { type: "function", function: { name: "responder" } },
    });

    const call = completion.choices[0]?.message.tool_calls?.[0];
    if (call?.type === "function" && call.function?.arguments) {
      const parsed = JSON.parse(call.function.arguments) as {
        mensagem: string;
        fase_atual?: number;
        sugestao?: string;
        pronto_para_gerar?: boolean;
      };
      return Response.json({
        reply: parsed.mensagem,
        suggestion: parsed.sugestao ?? "",
        phase: parsed.fase_atual ?? Math.min(userTurns + 1, 7),
        readyToGenerate: Boolean(parsed.pronto_para_gerar) || userTurns >= 5,
        source: "openai" as const,
      });
    }
    // sem tool call: usa o texto direto
    return Response.json({
      reply: completion.choices[0]?.message.content ?? "Pode me contar mais sobre o processo?",
      suggestion: "",
      phase: Math.min(userTurns + 1, 7),
      readyToGenerate: userTurns >= 5,
      source: "openai" as const,
    });
  } catch (err) {
    console.error("[copilot] falha na entrevista", err);
    const q = STATIC_INTERVIEW_QUESTIONS[Math.min(userTurns, STATIC_INTERVIEW_QUESTIONS.length - 1)];
    return Response.json({
      reply: q.mensagem,
      suggestion: q.sugestao,
      phase: Math.min(userTurns + 1, 7),
      readyToGenerate: userTurns >= 3,
      source: "fallback" as const,
    });
  }
}
