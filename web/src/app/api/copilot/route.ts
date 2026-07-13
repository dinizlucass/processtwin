import OpenAI from "openai";

const FIELD_HINT: Record<string, string> = {
  name: "Mantenha o nome do processo exatamente como o usuário escreveu (todas as palavras). Só corrija espaçamento e capitalização de erro de digitação óbvio — não capitalize preposições como 'de', 'da', 'do', e não abrevie nem corte parte do nome.",
  owner: "Nome da pessoa e, se informado, seu cargo. Formato: 'Nome — Cargo'.",
  criticality: "Normalize para exatamente uma das opções: 'Alta', 'Média' ou 'Baixa'.",
  ai: "Normalize para 'Sim — <detalhe da etapa>' ou 'Não', mantendo o detalhe dado pelo usuário.",
  esg: "Liste as dimensões ESG citadas (Ambiental / Social / Governança) separadas por ' · '.",
  systems: "Liste os sistemas citados separados por vírgula. Preserve a grafia de siglas/nomes de produto exatamente como o usuário escreveu (ex.: 'TOTVS RH', 'SAP ERP', 'DocuSign') — não reformate siglas para minúsculo ou título.",
};

export async function POST(req: Request) {
  const { field, question, answer } = (await req.json()) as {
    field: string;
    question: string;
    answer: string;
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ value: answer.trim(), source: "raw" as const });
  }

  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Você estrutura respostas de uma entrevista de mapeamento de processos corporativos (metodologia ProcessMind). " +
            "Extraia da resposta do usuário um valor limpo e padronizado para o campo indicado, sem inventar informação que não foi dada " +
            "e sem remover ou encurtar informação que o usuário deu — normalize apenas formatação (capitalização, pontuação, separadores). " +
            `Campo: "${field}". Regra de normalização: ${FIELD_HINT[field] ?? "Limpe e padronize o texto."}`,
        },
        {
          role: "user",
          content: `Pergunta feita ao usuário: "${question}"\nResposta do usuário: "${answer}"`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_field",
            description: "Salva o valor estruturado extraído da resposta do usuário.",
            parameters: {
              type: "object",
              properties: {
                value: { type: "string", description: "Valor limpo e padronizado para o card de resumo" },
              },
              required: ["value"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "save_field" } },
    });

    const call = completion.choices[0]?.message.tool_calls?.[0];
    if (call?.type === "function" && call.function?.arguments) {
      const parsed = JSON.parse(call.function.arguments) as { value: string };
      return Response.json({ value: parsed.value, source: "openai" as const });
    }
    return Response.json({ value: answer.trim(), source: "raw" as const });
  } catch (err) {
    console.error("[copilot] OpenAI extraction failed, falling back to raw answer", err);
    return Response.json({ value: answer.trim(), source: "raw" as const });
  }
}
