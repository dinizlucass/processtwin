// Non-persistent, multi-turn interview evaluation against the running app.
// Run with: node scripts/eval-interview.mjs
import { writeFile, mkdir, readFile } from "node:fs/promises";

const base = process.env.EVAL_BASE_URL || "http://localhost:3000";
const transcriptAll = process.argv.includes("--transcript-all");
const continueAfterReady = process.argv.includes("--continue-after-ready");
const selectedScenario = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
const outputOverride = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
const scenarios = [
  {
    id: "resposta_composta",
    goal: "Should stop after a dense answer without re-asking covered facts",
    answers: [
      "Mapeamos a liberação de pedidos de compra. A requisição aprovada dispara o processo; o analista de Compras confere fornecedor e saldo no SAP, em seguida o gerente de Compras aprova pedidos acima de R$ 50 mil. Se negar, devolve ao analista para correção; se aprovar, o analista emite o pedido no SAP e envia ao fornecedor. A saída é o pedido enviado. São cerca de 30 por semana, com prazo de 2 dias. A dor é retrabalho nas devoluções. Não sei dizer se alguma etapa usa IA ou se a conferência é manual/automatizada.",
      "Não tenho outros detalhes além desses. Prefiro deixar os atributos desconhecidos em aberto.",
    ],
  },
  {
    id: "informacao_gradual",
    goal: "Should ask targeted questions and stop within a few useful turns",
    answers: [
      "Quero mapear a devolução de mercadorias do centro de distribuição.",
      "Começa quando o recebimento identifica avaria. O conferente registra a ocorrência, o analista de Suprimentos solicita autorização ao fornecedor e, se autorizada, o operador expede a devolução. A saída é o comprovante de devolução.",
      "Se o fornecedor negar, o analista registra a pendência e encaminha ao gerente para decisão; não sei o que acontece depois da decisão. Usamos SAP para registrar a ocorrência e um e-mail para pedir a autorização.",
      "Não temos medição de tempo nem detalhes adicionais. O principal problema é a espera pela resposta do fornecedor.",
    ],
  },
  {
    id: "contradicao_e_lacuna",
    goal: "Should clarify contradictory branch and not invent an executor",
    answers: [
      "O processo é conciliação de fatura. A nota recebida inicia a conferência; o analista fiscal compara pedido, recebimento e nota no ERP. Se houver diferença, a nota fica pendente. A saída normal é fatura liberada para pagamento.",
      "Corrigindo: diferença de valor volta para Compras ajustar o pedido; diferença de quantidade volta para Recebimento corrigir o registro. Depois repete a conferência. Não sei quem libera a fatura no fim.",
      "Usamos Oracle ERP na conferência. Não sei se há integração automática, IA ou prazo formal. Não quero presumir executor da liberação.",
    ],
  },
  {
    id: "fonte_rica",
    goal: "Should use supplied transcript and only ask about a consequential gap",
    facts: {
      sourceTranscript: "Processo de inspeção de qualidade de lote. O lote recebido pelo Almoxarifado inicia a inspeção. A inspetora de Qualidade coleta amostra e registra o laudo no SAP. Se aprovado, entrega lote liberado à Armazenagem. Se reprovado, faz segunda amostragem; se esta for aprovada, libera o lote. Caso contrário, abre não conformidade e encaminha à devolução ao fornecedor. A reunião não informou SLA, uso de IA, responsável pela devolução nem tipo manual ou automático das tarefas. A maior dor é o retrabalho na segunda amostragem.",
      requirements: [],
      visao_geral: "Inspeção de qualidade de lote; objetivo avaliar conformidade.",
      gatilhos: "Lote recebido pelo Almoxarifado; saídas lote liberado ou não conformidade.",
      fluxo: "Qualidade coleta amostra e registra laudo; segunda amostragem após reprovação; aprovação libera, nova reprovação abre não conformidade.",
      sistemas: "SAP usado para registrar laudo; demais sistemas desconhecidos.",
      regras: "Segunda amostragem após primeira reprovação; resultado define liberação ou não conformidade.",
      dores: "Retrabalho na segunda amostragem.",
    },
    answers: [
      "Estou trazendo a transcrição da inspeção de qualidade; use o que já consta nela.",
      "Não tenho o SLA, o executor da devolução nem o modo de execução. Pode registrar como não informado.",
    ],
  },
];

async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

if (process.argv.includes("--generate-existing")) {
  const path = continueAfterReady ? ".e2e/interview-eval/report-luna-correction.json"
    : transcriptAll ? ".e2e/interview-eval/report-luna-transcript.json" : ".e2e/interview-eval/report.json";
  const report = JSON.parse(await readFile(path, "utf8"));
  for (const result of report.results.filter((r) => (!selectedScenario || r.id === selectedScenario) && !r.generation)) {
    const messages = result.turns.flatMap((t) => [
      { role: "user", text: t.user }, { role: "ai", text: t.question },
    ]);
    console.log(`Generating ${result.id}...`);
    const started = Date.now();
    try {
      const generated = await post("/api/copilot/generate", {
        messages, facts: result.facts ?? null,
        coverage: result.turns.at(-1)?.coverage ?? null,
      });
      result.generation = { ms: Date.now() - started, draft: generated.draft };
      console.log(`${result.id}: ${generated.draft?.nodes?.length} nodes, ${generated.draft?.reviewIssues?.length ?? 0} review issues`);
    } catch (error) {
      result.generation = { ms: Date.now() - started, error: String(error) };
      console.error(`${result.id}: ${error}`);
    }
    await writeFile(path, JSON.stringify(report, null, 2));
  }
  process.exit(0);
}

const results = [];
for (const scenario of scenarios.filter((s) => !selectedScenario || s.id === selectedScenario)) {
  const messages = [];
  const turns = [];
  const facts = transcriptAll && !scenario.facts
    ? { sourceTranscript: scenario.answers[0], requirements: [] }
    : scenario.facts ?? null;
  for (const answer of scenario.answers) {
    messages.push({ role: "user", text: answer });
    const started = Date.now();
    const data = await post("/api/copilot", { messages, facts });
    turns.push({ user: answer, question: data.reply, suggestions: data.suggestions, ready: data.readyToGenerate, coverage: data.coverage, source: data.source, ms: Date.now() - started });
    messages.push({ role: "ai", text: data.reply });
    console.log(`${scenario.id} #${turns.length}: ready=${data.readyToGenerate} ${data.reply}`);
    if (data.readyToGenerate && !continueAfterReady) break;
  }
  results.push({ id: scenario.id, goal: scenario.goal, facts, turns });
}
await mkdir(".e2e/interview-eval", { recursive: true });
const output = outputOverride || (continueAfterReady ? ".e2e/interview-eval/report-luna-correction.json"
  : transcriptAll ? ".e2e/interview-eval/report-luna-transcript.json" : ".e2e/interview-eval/report.json");
await writeFile(output, JSON.stringify({ transcriptAll, createdAt: new Date().toISOString(), results }, null, 2));
console.log(`Saved ${output}`);
