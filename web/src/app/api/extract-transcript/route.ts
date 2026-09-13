import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { PHASE_COUNT, normalizeFacts, normalizeCoverage, renderPhaseKeysForJson } from "@/lib/phases";
import { normalizeRequirements, REQUIREMENTS_PROMPT } from "@/lib/mapping-evidence";
import { mappingOptions } from "@/lib/ai-models";

export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Nenhum arquivo recebido." }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: "A transcrição deve ter no máximo 2 MB." }, { status: 413 });
    const text = await file.text();
    if (!text.trim()) return NextResponse.json({ error: "A transcrição está vazia." }, { status: 400 });

    const systemPrompt = `Você é um agente especialista em Task Mining e Inteligência de Processos.
Sua missão é analisar a transcrição bruta de uma reunião e extrair as informações necessárias para mapear um processo.

Nosso roteiro de mapeamento segue uma ordem estrita de ${PHASE_COUNT} fases:
${renderPhaseKeysForJson()}

SUAS INSTRUÇÕES:
1. Devolva um objeto "facts" com EXATAMENTE as ${PHASE_COUNT} chaves acima. Para cada fase, escreva um resumo objetivo e detalhado do que a transcrição diz (na fase "fluxo", liste as etapas em ordem, cada uma com verbo + objeto e o executor; na fase "sistemas", diga qual sistema é usado em qual etapa). Se a transcrição não mencionar dados suficientes para uma fase, o valor deve ser explicitamente null — nunca invente.
2. Identifique a PRIMEIRA FASE (em ordem de 1 a ${PHASE_COUNT}) que ficou com dados ausentes ou muito incompletos e devolva em "fase_inicial" (inteiro). Ex.: se as fases 1, 2 e 3 estão claras mas falta a 4, retorne 4. Se tudo estiver preenchido, retorne ${PHASE_COUNT}.
3. Devolva "mensagem_inicial" (string): informe o que foi extraído e faça UMA pergunta apenas sobre uma lacuna real que altere o fluxo. Não peça novamente nome, sistemas, atores, volumes ou regras explícitas. Se não houver lacunas essenciais, convide a gerar o pré-mapeamento.
4. Devolva "coverage": uma entrada por fase {"key": chave, "status": "coberto"|"parcial"|"vazio", "resumo": fatos conhecidos, "faltando": lacuna específica}. Informação explícita na transcrição pode ser coberta, sem reconfirmação. Só use parcial por lacunas concretas, não pela origem documental.

REGRAS ESTRITAS:
- Preserve no fluxo cotações, negociação, análises e assinaturas separadamente quando descritas. Diferencie participantes da reunião de executores: use funções citadas nas raias; não atribua uma tarefa ao entrevistado só porque ele a explicou.
- Separe AS-IS de propostas futuras, riscos e exemplos. Um caso real demonstra um retorno, mas suas datas não estabelecem um SLA geral. Não transforme todos os riscos em controles existentes.
- Se limites numéricos forem ambíguos ou sobrepostos, preserve a redação e registre a fronteira a confirmar; não invente alçadas.
- Não assuma que gestor de uma área é o Process Owner. Não deduza criticidade pelo nome do processo. SLA de aprovação pertence à aprovação, não ao processo inteiro. Preserve todas as métricas informadas sem pedir detalhes opcionais já disponíveis de forma agregada.
- Retorne EXCLUSIVAMENTE um objeto JSON no formato { "facts": { ... }, "coverage": [...], "fase_inicial": inteiro, "mensagem_inicial": string }.
- Não adicione textos fora do JSON.`;

    const [response, evidenceResponse] = await Promise.all([openai.chat.completions.create({
      ...mappingOptions(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Aqui está a transcrição da reunião:\n\n${text}` }
      ],
    }), openai.chat.completions.create({
      ...mappingOptions(),
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: REQUIREMENTS_PROMPT }, { role: "user", content: text }],
    })]);

    const resultString = response.choices[0].message.content || "{}";
    const parsed = JSON.parse(resultString) as {
      facts?: unknown;
      fase_inicial?: number;
      mensagem_inicial?: string;
      coverage?: unknown;
    };

    // Aceita tanto o formato novo ({ facts: {...} }) quanto um objeto plano
    // (compatibilidade), e normaliza para as chaves canônicas das fases.
    const facts = normalizeFacts(parsed.facts ?? parsed);
    facts.sourceTranscript = text;
    const evidence = JSON.parse(evidenceResponse.choices[0]?.message.content || "{}");
    facts.requirements = normalizeRequirements(evidence.requirements, text);
    if (Array.isArray(parsed.coverage)) facts.coverage = normalizeCoverage(parsed.coverage);
    const ruleQuestion = facts.requirements.find((item) => item.question)?.question;
    if (ruleQuestion && facts.coverage) facts.coverage = facts.coverage.map((phase) => phase.key === "regras" ? { ...phase, status: "parcial", faltando: ruleQuestion } : phase);
    const faseInicial =
      Number.isInteger(parsed.fase_inicial) && parsed.fase_inicial! >= 1 && parsed.fase_inicial! <= PHASE_COUNT
        ? parsed.fase_inicial
        : 1;

    return NextResponse.json({
      facts,
      fase_inicial: ruleQuestion ? 5 : faseInicial,
      mensagem_inicial: ruleQuestion ? `A transcrição foi extraída, incluindo regras e exceções. Falta esclarecer um caminho: ${ruleQuestion}` : parsed.mensagem_inicial ?? "",
    });

  } catch (error) {
    console.error("[extract-transcript] falha", error instanceof OpenAI.APIError ? { status: error.status, code: error.code } : error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: "Falha ao ler a transcrição e processar os dados com IA." },
      { status: 500 }
    );
  }
}
