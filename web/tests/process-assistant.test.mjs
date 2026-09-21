import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { catalogKpis, rankProcesses, buildEvidence, isOperationalQuestion, answerCatalogQuestion, answerStructuredList, citationsAreValid, groundFollowUp } = loadTs("lib/process-assistant.ts");

const processes = [
  { id: "p1", name: "Cadastro de fornecedor", code: "F01", department: "Compras", criticality: "alta", version: 2, objective: "Registrar fornecedor", scope: null, trigger_desc: "Solicitação recebida", inputs: null, outputs: "Fornecedor cadastrado", frequency: null, sla: "5 dias", last_reviewed_at: "2023-01-01", owner: { name: "Ana" } },
  { id: "p2", name: "Aprovação de compra", code: "C02", department: "Compras", criticality: "media", version: 1, objective: null, scope: null, trigger_desc: "Pedido recebido", inputs: null, outputs: "Compra aprovada", frequency: null, sla: null, last_reviewed_at: null, owner: null },
  { id: "p3", name: "Pagamento", code: "F03", department: "Financeiro", criticality: "baixa", version: 1, objective: null, scope: null, trigger_desc: null, inputs: null, outputs: null, frequency: null, sla: null, last_reviewed_at: "2025-12-01", owner: { name: "Bia" } },
];
const catalog = {
  processes,
  nodes: [
    { process_id: "p1", node_id: "n1", kind: "task", label: "Validar CNPJ", actor: "Ana", activity_type: "manual", uses_ai: null, attributes: { systems: ["SAP"] } },
    { process_id: "p1", node_id: "n2", kind: "task", label: "Aprovar cadastro", actor: "Bia", activity_type: "manual", uses_ai: false, attributes: null },
    { process_id: "p2", node_id: "lane", kind: "lane", label: "Compras", actor: null, activity_type: null, uses_ai: null, attributes: null },
  ],
  edges: [{ process_id: "p1", source_id: "n1", target_id: "n2", label: "Sim" }],
  relationships: [{ from_process: "p1", to_process: "p2", kind: "handoff", label: "Cadastro aprovado" }],
  systems: [{ process_id: "p1", system_name: "SAP", is_primary: null }],
  pains: [{ process_id: "p1", description: "Retrabalho no cadastro" }],
  opportunities: [{ process_id: "p1", title: "Automatizar validação" }],
};

test("KPIs usam somente dados estruturados e raia não conta como mapeamento", () => {
  const k = catalogKpis(catalog, new Date("2026-09-20T12:00:00Z"));
  assert.equal(k.total, 3);
  assert.equal(k.critical, 1);
  assert.equal(k.mapped, 1);
  assert.equal(k.coveragePercent, 33);
  assert.equal(k.overdue, 1);
  assert.equal(k.withoutReview, 1);
  assert.equal(k.withoutOwner, 1);
  assert.equal(k.confirmedRelationships, 1);
  assert.deepEqual(k.byDepartment, { Compras: 2, Financeiro: 1 });
});

test("busca encontra sistema nas atividades e preserva fontes", () => {
  assert.equal(rankProcesses("Quais processos usam SAP?", catalog)[0].id, "p1");
  const e = buildEvidence("Quem valida CNPJ no SAP?", catalog);
  assert.equal(e.sources[0].href, "/modelagem/p1");
  assert.equal(e.processes[0].activities[0].actor, "Ana");
  assert.equal(e.processes[0].activities[0].usesAI, null);
  assert.equal(e.processes[0].pains[0].description, "Retrabalho no cadastro");
  assert.equal(e.processes[0].opportunities[0].title, "Automatizar validação");
  assert.deepEqual(e.processes[0].connections[0], { from: "n1", fromLabel: "Validar CNPJ", to: "n2", toLabel: "Aprovar cadastro", condition: "Sim" });
  assert.equal(e.relationships[0].status, "confirmada");
});

test("não converte SLA documentado em KPI operacional", () => {
  assert.equal(isOperationalQuestion("Qual foi o tempo médio real de aprovação nos últimos 30 dias?"), true);
  assert.equal(isOperationalQuestion("Qual SLA documentado da aprovação?"), false);
});

test("catálogo vazio não produz percentuais inválidos", () => {
  const k = catalogKpis({ processes: [], nodes: [], edges: [], relationships: [], systems: [], pains: [], opportunities: [] });
  assert.equal(k.total, 0);
  assert.equal(k.coveragePercent, 0);
});

test("KPI direto reproduz valor e escopo sem citar processo inexistente", () => {
  const answer = answerCatalogQuestion("Quantos processos estão mapeados?", catalogKpis(catalog));
  assert.match(answer, /1 processos mapeados de 3/);
  assert.doesNotMatch(answer, /\[P\d+\]/);
});

test("citações inventadas ou ausentes são recusadas", () => {
  assert.equal(citationsAreValid("Ana aprova [P1]", ["P1"], true), true);
  assert.equal(citationsAreValid("Ana aprova [P9]", ["P1"], true), false);
  assert.equal(citationsAreValid("Ana aprova", ["P1"], true), false);
  assert.equal(citationsAreValid("Total 3 [P1]", [], false), false);
});

test("pergunta de relações recupera extremidades confirmadas", () => {
  const e = buildEvidence("Quais processos se relacionam?", catalog);
  assert.equal(e.relationships.length, 1);
  assert.equal(e.sources.length, 2);
  assert.equal(e.relationships[0].status, "confirmada");
});

test("listas de sistemas e relações são completas e determinísticas", () => {
  const systems = answerStructuredList("Quais processos usam SAP?", catalog);
  assert.match(systems.answer, /^1 processos registram uso de SAP/);
  assert.equal(systems.sources[0].href, "/modelagem/p1");
  assert.doesNotMatch(systems.answer, /p2/);
  const relationships = answerStructuredList("Quais processos se relacionam?", catalog);
  assert.match(relationships.answer, /^1 relações confirmadas/);
  assert.equal(relationships.sources.length, 2);
});

test("nome explícito de processo inexistente não recupera processo alheio", () => {
  assert.deepEqual(rankProcesses("Como funciona o processo de colheita lunar?", catalog), []);
});

test("dores registradas vêm apenas do campo próprio", () => {
  const recorded = answerStructuredList("Quais dores foram registradas no processo Cadastro de fornecedor?", catalog);
  assert.match(recorded.answer, /Retrabalho no cadastro/);
  const absent = answerStructuredList("Quais dores foram registradas no processo Aprovação de compra?", catalog);
  assert.match(absent.answer, /Nenhuma dor está formalmente registrada/);
  assert.doesNotMatch(absent.answer, /Automatizar validação/);
});

test("KPI combinado aplica filtros antes de contar mapeamento", () => {
  const answer = answerCatalogQuestion("Quantos processos críticos estão mapeados?", catalogKpis(catalog), catalog);
  assert.match(answer, /1 processos mapeados de 1 com criticidade alta/);
  const byArea = answerCatalogQuestion("Quantos processos da área Compras estão mapeados?", catalogKpis(catalog), catalog);
  assert.match(byArea, /1 processos mapeados de 2 com área Compras/);
});

test("filtro sem registros no escopo retorna zero em vez do total", () => {
  const empty = { ...catalog, processes: [processes[2]], nodes: [], edges: [], systems: [], relationships: [], pains: [], opportunities: [] };
  const answer = answerCatalogQuestion("Quantos processos da área Compras estão mapeados?", catalogKpis(empty), empty);
  assert.match(answer, /0 processos mapeados de 0 com área compras/i);
  const system = answerStructuredList("Quais processos usam SAP?", empty);
  assert.match(system.answer, /Nenhum processo registra SAP/);
});

test("nomes duplicados pedem código antes de explicar fluxo", () => {
  const duplicated = { ...catalog, processes: [...processes, { ...processes[0], id: "p4", code: "F04", version: 3 }] };
  const answer = answerStructuredList("Como é o fluxo do processo Cadastro de fornecedor?", duplicated);
  assert.match(answer.answer, /Encontrei 2 registros/);
  assert.match(answer.answer, /F01/);
  assert.match(answer.answer, /F04/);
  assert.equal(answer.sources.length, 2);
  assert.equal(buildEvidence("Como é o fluxo do processo Cadastro de fornecedor F04?", duplicated).sources[0].href, "/modelagem/p4");
});

test("pergunta de acompanhamento herda só o processo anterior", () => {
  const prior = [{ role: "user", content: "Como é o fluxo do processo Cadastro de fornecedor?" }];
  const expanded = groundFollowUp("Quem valida CNPJ?", prior, catalog);
  assert.match(expanded, /Cadastro de fornecedor F01/);
  assert.equal(buildEvidence(expanded, catalog).sources.length, 1);
  assert.equal(groundFollowUp("Quantos processos estão mapeados?", prior, catalog), "Quantos processos estão mapeados?");
});
