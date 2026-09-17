import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { loadTs } from "../tests/load-ts.mjs";

if (process.env.E2E_LIVE !== "1") throw new Error("Set E2E_LIVE=1 for real services.");
nextEnv.loadEnvConfig(process.cwd());

const base = process.env.E2E_BASE_URL || "http://localhost:3000";
const run = randomUUID();
const runTag = run.slice(0, 8);
const area = `E2E Suprimentos Integrados ${runTag}`;
const owner = `E2E Gerente de Suprimentos ${runTag}`;
const outDir = `.e2e/network-${runTag}`;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { validateFlow } = loadTs("lib/flow-analysis.ts");
const { inferHandoffCandidates } = loadTs("lib/handoffs.ts");

const specs = [
  {
    key: "P01", name: "Planejamento de demanda", system: "SAP IBP",
    output: "plano consolidado de demanda aprovado",
    terms: ["coletar previsões", "consolidar demanda", "aprovar plano", "divergência"],
    transcript: "O analista coleta previsões mensais das unidades no SAP IBP, valida códigos e quantidades e consolida a demanda. O planejador compara a previsão com consumo histórico. Se houver divergência superior a 20%, devolve à unidade para justificativa e repete a validação. Sem divergência relevante, o gerente de suprimentos aprova o plano. A saída é o plano consolidado de demanda aprovado, que inicia a abertura das requisições de compra. Frequência mensal, SLA de cinco dias úteis. Dor: previsões chegam atrasadas. Oportunidade: alertas automáticos de atraso.",
  },
  {
    key: "P02", name: "Abertura de requisição de compra", system: "SAP S/4HANA",
    output: "requisição de compra liberada",
    terms: ["plano consolidado", "criar requisição", "validar centro de custo", "orçamento"],
    transcript: "O gatilho é o plano consolidado de demanda aprovado. O comprador importa os itens no SAP S/4HANA, cria a requisição e valida descrição, quantidade, prazo e centro de custo. O analista de suprimentos verifica disponibilidade orçamentária. Se não houver orçamento, devolve ao solicitante para ajuste e encerra como pendente. Se houver orçamento, o coordenador libera a requisição. A saída é a requisição de compra liberada, usada para iniciar o sourcing de fornecedores. Frequência diária, SLA de um dia útil. Dor: cadastros incompletos. Oportunidade: validação obrigatória de campos.",
  },
  {
    key: "P03", name: "Sourcing e cotação de fornecedores", system: "Ariba Sourcing",
    output: "shortlist de fornecedores selecionados",
    terms: ["requisição de compra", "cotação", "três propostas", "shortlist"],
    transcript: "O processo começa quando existe uma requisição de compra liberada. O comprador publica a cotação no Ariba Sourcing e convida fornecedores. Para compras acima de dez mil reais exige no mínimo três propostas; abaixo disso aceita duas. O comprador compara preço, prazo e condições. Se não houver propostas suficientes, prorroga a cotação uma vez; persistindo a falta, registra a exceção para aprovação do coordenador. Ao final seleciona a shortlist. A saída é a shortlist de fornecedores selecionados, enviada para homologação cadastral. SLA de quatro dias úteis. Dor: baixa resposta dos fornecedores. Oportunidade: ampliar a base convidada.",
  },
  {
    key: "P04", name: "Homologação cadastral de fornecedor", system: "Portal de Fornecedores",
    output: "fornecedor homologado para contratação",
    terms: ["shortlist", "documentos fiscais", "compliance", "homologado"],
    transcript: "O gatilho é a shortlist de fornecedores selecionados. O analista solicita documentos fiscais, bancários e certificados pelo Portal de Fornecedores. Depois confere validade documental e consulta listas de sanções. Se houver documento vencido ou alerta de compliance, solicita correção e repete a análise; se o alerta for impeditivo, reprova o fornecedor e comunica o comprador. Quando tudo está regular, o coordenador aprova o cadastro. A saída é o fornecedor homologado para contratação, necessário para emitir o pedido de compra. SLA de três dias úteis. Dor: documentos vencidos. Oportunidade: alertas de validade.",
  },
  {
    key: "P05", name: "Emissão de pedido de compra", system: "SAP S/4HANA",
    output: "pedido de compra aprovado e enviado",
    terms: ["fornecedor homologado", "pedido de compra", "alçada", "enviado"],
    transcript: "O processo inicia com fornecedor homologado para contratação e requisição liberada. O comprador converte a requisição em pedido no SAP S/4HANA, inclui preços, impostos, prazo e endereço de entrega e anexa a proposta vencedora. O sistema direciona para a alçada: coordenador até cem mil reais e gerente acima desse valor. Se o aprovador rejeitar, o comprador corrige e reenvia. Se aprovar, o comprador envia o pedido ao fornecedor e registra o aceite. A saída é o pedido de compra aprovado e enviado, que autoriza o recebimento do material. SLA de um dia útil. Dor: retrabalho tributário. Oportunidade: regras fiscais automáticas.",
  },
  {
    key: "P06", name: "Recebimento físico de materiais", system: "WMS Logístico",
    output: "material recebido e lote identificado",
    terms: ["pedido de compra", "conferir quantidade", "avaria", "lote"],
    transcript: "O gatilho é a chegada do material referente a um pedido de compra aprovado e enviado. O assistente de recebimento consulta o pedido no WMS, confere fornecedor, item, quantidade e nota fiscal e inspeciona embalagens. Se houver divergência de quantidade ou avaria visível, bloqueia o recebimento, fotografa e aciona o processo de devolução ao fornecedor. Se estiver conforme, registra a entrada provisória, etiqueta o lote e encaminha para inspeção de qualidade. A saída é o material recebido e lote identificado. SLA de quatro horas. Dor: filas na doca. Oportunidade: agendamento de entrega.",
  },
  {
    key: "P07", name: "Inspeção de qualidade do lote", system: "QMS Qualidade",
    output: "lote aprovado para armazenagem ou laudo de não conformidade emitido",
    terms: ["material recebido", "amostra", "especificação", "não conformidade"],
    transcript: "O processo começa com material recebido e lote identificado. O inspetor coleta amostra conforme o plano no QMS, executa testes visuais e dimensionais e compara com a especificação. Se o lote estiver conforme, registra aprovação e libera para armazenagem. Se estiver não conforme, bloqueia o lote, emite laudo de não conformidade e encaminha para devolução ao fornecedor. Em resultado inconclusivo, repete a amostragem uma única vez e então decide. A saída é lote aprovado para armazenagem ou laudo de não conformidade emitido. SLA de oito horas. Dor: registros manuais. Oportunidade: integração com instrumentos.",
  },
  {
    key: "P08", name: "Armazenagem e disponibilização de estoque", system: "WMS Logístico",
    output: "estoque disponível para consumo e recebimento liberado para conciliação",
    terms: ["lote aprovado", "endereçamento", "armazenar", "estoque disponível"],
    transcript: "O gatilho é o lote aprovado para armazenagem. O almoxarife consulta no WMS a regra de endereçamento, transporta o material até a posição indicada, confirma lote, validade e quantidade e finaliza a armazenagem. Se a posição estiver ocupada ou incompatível, solicita novo endereço e repete a movimentação. Ao concluir, o sistema atualiza o saldo e informa suprimentos. A saída é estoque disponível para consumo e recebimento liberado para conciliação de fatura. SLA de duas horas. Dor: endereços inconsistentes. Oportunidade: leitura por código de barras.",
  },
  {
    key: "P09", name: "Devolução ao fornecedor", system: "Portal de Fornecedores",
    output: "devolução expedida e crédito de fornecedor solicitado",
    terms: ["avaria", "laudo de não conformidade", "autorizar devolução", "crédito"],
    transcript: "O processo é iniciado por material com avaria no recebimento ou por laudo de não conformidade emitido na inspeção. O analista reúne fotos, laudo, pedido e nota fiscal no Portal de Fornecedores e solicita autorização de devolução. Se o fornecedor contestar, o coordenador avalia as evidências; se aceitar a contestação, devolve o lote para nova inspeção, caso contrário mantém a devolução. Com autorização, o assistente embala, emite documento de saída e despacha o material. A saída é a devolução expedida e crédito de fornecedor solicitado, que deve ser acompanhado na conciliação. SLA de dois dias úteis. Dor: demora na autorização. Oportunidade: workflow compartilhado.",
  },
  {
    key: "P10", name: "Conciliação de fatura de fornecedor", system: "SAP S/4HANA",
    output: "fatura conciliada e liberada para pagamento ou divergência registrada",
    terms: ["recebimento liberado", "crédito de fornecedor", "três documentos", "divergência"],
    transcript: "O gatilho é o recebimento liberado para conciliação ou um crédito de fornecedor solicitado após devolução. O analista compara no SAP o pedido de compra, o recebimento e a nota fiscal, realizando a conferência de três documentos. Se valores e quantidades coincidirem, libera a fatura para pagamento. Se houver diferença ligada a devolução, aplica o crédito confirmado; se o crédito ainda não existir, mantém a fatura bloqueada e cobra o fornecedor. Outras divergências retornam ao comprador para correção. A saída é fatura conciliada e liberada para pagamento ou divergência registrada. SLA de dois dias úteis. Dor: créditos tardios. Oportunidade: conciliação automática.",
  },
];

const expectedLinks = [
  ["P01", "P02", "Plano de demanda inicia requisição"],
  ["P02", "P03", "Requisição liberada inicia sourcing"],
  ["P03", "P04", "Shortlist segue para homologação"],
  ["P04", "P05", "Fornecedor homologado permite o pedido"],
  ["P05", "P06", "Pedido aprovado autoriza recebimento"],
  ["P06", "P07", "Lote recebido segue para inspeção"],
  ["P06", "P09", "Avaria inicia devolução"],
  ["P07", "P08", "Lote aprovado segue para armazenagem"],
  ["P07", "P09", "Não conformidade inicia devolução"],
  ["P08", "P10", "Recebimento liberado segue para conciliação"],
  ["P09", "P10", "Crédito solicitado segue para conciliação"],
];

const report = { run, runTag, area, model: process.env.OPENAI_MAPPING_MODEL || "default", started: new Date().toISOString(), processes: [], expectedLinks, inferredBeforeConfirmation: [], confirmedLinks: [] };
fs.mkdirSync(outDir, { recursive: true });
const reportPath = `${outDir}/report.json`;
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

async function json(path, body, timeout = 330000) {
  const response = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const data = await response.json();
  assert.equal(response.status, 200, `${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

function norm(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

async function mapOne(spec, index) {
  const transcript = `Cenário sintético integrado ${runTag}. Processo ${spec.key}: E2E ${spec.name}. Área única: ${area}. Dono: ${owner}. Criticidade média. ${spec.transcript} Todas as atividades pertencem à área de Suprimentos; áreas externas não executam tarefas neste teste. Não invente caminhos além dos descritos.`;
  fs.writeFileSync(`${outDir}/${String(index + 1).padStart(2, "0")}-${spec.key}.txt`, transcript);
  const timings = {};
  let started = Date.now();
  const form = new FormData(); form.append("file", new Blob([transcript], { type: "text/plain" }), `${spec.key}.txt`);
  const extractionResponse = await fetch(base + "/api/extract-transcript", { method: "POST", body: form, signal: AbortSignal.timeout(180000) });
  const extracted = await extractionResponse.json();
  assert.equal(extractionResponse.status, 200, JSON.stringify(extracted));
  timings.extractionMs = Date.now() - started;

  const messages = [{ role: "user", text: transcript }];
  started = Date.now();
  const interview = await json("/api/copilot", { messages, facts: extracted.facts }, 180000);
  timings.interviewMs = Date.now() - started;
  assert.equal(interview.source, "openai", `${spec.key} interview fallback`);

  started = Date.now();
  const generated = await json("/api/copilot/generate", { messages, facts: extracted.facts, coverage: interview.coverage }, 330000);
  timings.generationMs = Date.now() - started;
  const draft = generated.draft;
  assert.ok(draft?.nodes?.length && draft?.edges?.length, `${spec.key} empty draft`);
  const structuralIssues = validateFlow(draft.nodes.map((node) => ({ id: node.id, type: node.kind, position: { x: 0, y: 0 }, data: node })), draft.edges);
  const haystack = norm(JSON.stringify({ process: draft.process, systems: draft.systems, nodes: draft.nodes, edges: draft.edges }));
  const termChecks = Object.fromEntries(spec.terms.map((term) => [term, haystack.includes(norm(term))]));
  const metadataChecks = {
    area: norm(draft.process.department).includes("suprimentos"),
    owner: norm(draft.process.owner).includes("gerente de suprimentos"),
    system: norm(JSON.stringify(draft.systems)).includes(norm(spec.system)),
    output: norm(draft.process.outputs).includes(norm(spec.output).split(" ")[0]),
  };

  // Deterministic E2E identifiers prevent model wording variation from polluting the repository.
  draft.process.name = `E2E-${runTag}-${spec.key} ${spec.name}`;
  draft.process.department = area;
  draft.process.owner = owner;
  draft.process.outputs = spec.output;

  const conversation = await json("/api/ai-conversation", { messages, extractedFields: extracted.facts });
  const committed = await json("/api/mapping/commit", {
    requestId: randomUUID(),
    conversationId: conversation.id,
    draft,
    // This stress scenario deliberately records the reviewer warnings in its
    // report and accepts them explicitly; production callers must do the same.
    acceptReviewIssues: true,
  });
  return {
    key: spec.key, name: draft.process.name, processId: committed.processId, conversationId: conversation.id,
    timings, nodes: draft.nodes.length, edges: draft.edges.length, structuralIssues,
    reviewIssues: draft.reviewIssues ?? [], pendingTraceability: (draft.traceability ?? []).filter((item) => item.status === "pending").length,
    termChecks, metadataChecks, interviewSource: interview.source,
  };
}

try {
  // Two concurrent pipelines exercise realistic load without overwhelming a low API tier.
  for (let i = 0; i < specs.length; i += 2) {
    const batch = await Promise.all(specs.slice(i, i + 2).map((spec, offset) => mapOne(spec, i + offset)));
    report.processes.push(...batch);
    save();
    for (const item of batch) console.log("MAPPED", item.key, `${item.nodes} nodes`, `${item.edges} edges`, `${item.timings.generationMs}ms`, `${item.structuralIssues.length} structural issues`);
  }

  const ids = new Map(report.processes.map((p) => [p.key, p.processId]));
  const { data: rows, error: processError } = await sb.from("process").select("id,name,trigger_desc,outputs").in("id", [...ids.values()]);
  assert.ifError(processError);
  const io = rows.map((row) => ({ ...row, trigger: row.trigger_desc, systems: [] }));
  const inferred = inferHandoffCandidates(io, 100);
  report.inferredBeforeConfirmation = inferred.map((h) => ({ source: report.processes.find((p) => p.processId === h.source)?.key, target: report.processes.find((p) => p.processId === h.target)?.key, label: h.label }));

  for (const [from, to, label] of expectedLinks) {
    const saved = await json("/api/relationships", { fromProcess: ids.get(from), toProcess: ids.get(to), label });
    report.confirmedLinks.push({ from, to, label, relationshipId: saved.id });
  }

  const { data: relationships, error: relError } = await sb.from("process_relationship").select("id,from_process,to_process,label").in("from_process", [...ids.values()]);
  assert.ifError(relError);
  const actual = new Set(relationships.filter((r) => ids.has([...ids].find(([, id]) => id === r.to_process)?.[0])).map((r) => `${r.from_process}->${r.to_process}`));
  for (const [from, to] of expectedLinks) assert.ok(actual.has(`${ids.get(from)}->${ids.get(to)}`), `missing confirmed link ${from}->${to}`);

  report.summary = {
    mapped: report.processes.length,
    structurallyValid: report.processes.filter((p) => p.structuralIssues.length === 0).length,
    withoutReviewIssues: report.processes.filter((p) => p.reviewIssues.length === 0).length,
    withoutPendingTraceability: report.processes.filter((p) => p.pendingTraceability === 0).length,
    contentChecksPassed: report.processes.reduce((n, p) => n + Object.values(p.termChecks).filter(Boolean).length, 0),
    contentChecksTotal: report.processes.reduce((n, p) => n + Object.keys(p.termChecks).length, 0),
    metadataChecksPassed: report.processes.reduce((n, p) => n + Object.values(p.metadataChecks).filter(Boolean).length, 0),
    metadataChecksTotal: report.processes.reduce((n, p) => n + Object.keys(p.metadataChecks).length, 0),
    inferredExpectedLinks: expectedLinks.filter(([from, to]) => report.inferredBeforeConfirmation.some((h) => h.source === from && h.target === to)).length,
    expectedLinks: expectedLinks.length,
    confirmedLinks: report.confirmedLinks.length,
    totalGenerationMs: report.processes.reduce((n, p) => n + p.timings.generationMs, 0),
  };
  report.completed = new Date().toISOString();
  save();
  console.log("SUMMARY", JSON.stringify(report.summary));
  console.log("REPORT", reportPath);
} catch (error) {
  report.error = { name: error.name, message: error.message, stack: error.stack };
  save();
  console.error(error);
  process.exitCode = 1;
}
