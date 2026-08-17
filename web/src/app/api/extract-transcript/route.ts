import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { PHASE_COUNT, normalizeFacts, normalizeOpeningFields, renderPhaseKeysForJson } from "@/lib/phases";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo recebido." }, { status: 400 });
    }

    const text = await file.text();

    const systemPrompt = `Você é um agente especialista em Task Mining e Inteligência de Processos.
Sua missão é analisar a transcrição bruta de uma reunião e extrair as informações necessárias para mapear um processo.

Nosso roteiro de mapeamento segue uma ordem estrita de ${PHASE_COUNT} fases:
${renderPhaseKeysForJson()}

SUAS INSTRUÇÕES:
1. Devolva um objeto "facts" com EXATAMENTE as ${PHASE_COUNT} chaves acima. Para cada fase, escreva um resumo objetivo e detalhado do que a transcrição diz (na fase "fluxo", liste as etapas em ordem, cada uma com verbo + objeto e o executor; na fase "sistemas", diga qual sistema é usado em qual etapa). Se a transcrição não mencionar dados suficientes para uma fase, o valor deve ser explicitamente null — nunca invente.
2. Identifique a PRIMEIRA FASE (em ordem de 1 a ${PHASE_COUNT}) que ficou com dados ausentes ou muito incompletos e devolva em "fase_inicial" (inteiro). Ex.: se as fases 1, 2 e 3 estão claras mas falta a 4, retorne 4. Se tudo estiver preenchido, retorne ${PHASE_COUNT}.
3. Devolva "mensagem_inicial" (string): resuma em tom amigável e consultivo o que você já conseguiu mapear com a transcrição e faça UMA pergunta direta e específica sobre a "fase_inicial" para continuar o mapeamento.
4. Devolva "opening" (objeto) com estes campos DISCRETOS, preenchidos com o que a transcrição disser — string vazia "" quando a transcrição não informar (NUNCA invente): "nome" (nome do processo), "objetivo", "dono" (responsável, com cargo se houver), "area" (departamento), "criticidade" (exatamente "Alta", "Média" ou "Baixa", ou "" se não der pra inferir), "frequencia", "volume" (volume médio).

REGRAS ESTRITAS:
- Retorne EXCLUSIVAMENTE um objeto JSON no formato { "facts": { ... }, "opening": { ... }, "fase_inicial": inteiro, "mensagem_inicial": string }.
- Não adicione textos fora do JSON.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Lembre-se de mudar para "gpt-3.5-turbo" se necessário
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Aqui está a transcrição da reunião:\n\n${text}` }
      ],
    });

    const resultString = response.choices[0].message.content || "{}";
    // TEMPORÁRIO: confirmar a forma crua que o modelo devolve (remover depois).
    console.log("[extract-transcript] resposta crua do modelo:", resultString);
    const parsed = JSON.parse(resultString) as {
      facts?: unknown;
      opening?: unknown;
      fase_inicial?: number;
      mensagem_inicial?: string;
    };

    // Aceita tanto o formato novo ({ facts: {...} }) quanto um objeto plano
    // (compatibilidade), e normaliza para as chaves canônicas das fases.
    const facts = normalizeFacts(parsed.facts ?? parsed);
    const opening = normalizeOpeningFields(parsed.opening ?? parsed);
    const faseInicial =
      Number.isInteger(parsed.fase_inicial) && parsed.fase_inicial! >= 1 && parsed.fase_inicial! <= PHASE_COUNT
        ? parsed.fase_inicial
        : 1;

    return NextResponse.json({
      facts,
      opening,
      fase_inicial: faseInicial,
      mensagem_inicial: parsed.mensagem_inicial ?? "",
    });

  } catch (error) {
    console.error("[extract-transcript] Erro ao processar arquivo:", error);
    return NextResponse.json(
      { error: "Falha ao ler a transcrição e processar os dados com IA." },
      { status: 500 }
    );
  }
}