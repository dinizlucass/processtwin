import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { normalizeRequirements, reconcileTraceability, generatedBranchIssues, removeUnsupportedClaims } = loadTs("lib/mapping-evidence.ts");
const { buildKnownFactsBlock, coverageFromFacts } = loadTs("lib/phases.ts");
const { sanitizePreMapping, toReactFlow } = loadTs("lib/premapping.ts");
const { preMappingToEditorFlow, editorFlowToPreMapping } = loadTs("lib/draft-flow.ts");

test("evidence must quote the source; duplicate and invented excerpts are rejected", () => {
  const source = "Acima de R$ 500 mil passa por Compliance e Jurídico.\nExige carta de exclusividade.";
  const requirements = normalizeRequirements([
    { text: "Análises adicionais", quote: "Acima de R$ 500 mil passa por Compliance e Jurídico." },
    { text: "Análises adicionais", quote: "Acima de R$ 500 mil passa por Compliance e Jurídico." },
    { text: "Inventada", quote: "A diretoria aprova todas as compras." },
    { text: "Carta", quote: "Exige carta de exclusividade." },
  ], source);
  assert.deepEqual(requirements.map((item) => item.id), ["r1", "r2"]);
});

test("unknown AI and primary system cannot become asserted attributes", () => {
  const draft = {
    process: { usesAI: false, painPoints: ["Executor não informado", "Retrabalho nas devoluções"], opportunities: ["Automatizar aprovação"] },
    systems: [{ name: "SAP", isPrimary: true }],
  };
  removeUnsupportedClaims(draft, "Há retrabalho nas devoluções. Não sei se usa IA. SAP registra a ocorrência.");
  assert.equal(draft.process.usesAI, undefined);
  assert.equal(draft.systems[0].isPrimary, undefined);
  assert.deepEqual(draft.process.painPoints, ["Retrabalho nas devoluções"]);
  assert.deepEqual(draft.process.opportunities, []);
});

test("omitted requirements and nonexistent node references remain pending", () => {
  const requirements = ["r1", "r2", "r3"].map((id) => ({ id, text: id, quote: "Evidência informada" }));
  const traces = reconcileTraceability([
    { requirementId: "r1", status: "mapped", nodeIds: ["task"], explanation: "Representada" },
    { requirementId: "r2", status: "mapped", nodeIds: ["ghost"] },
  ], requirements, new Set(["task"]));
  assert.deepEqual(traces.map((item) => item.status), ["mapped", "pending", "pending"]);
  assert.deepEqual(traces[1].nodeIds, []);
});

test("different rules with the same category survive and quotes preserve original casing", () => {
  const source = "Até 10 mil o fluxo é simplificado. Acima de 500 mil passa por análise adicional.";
  const requirements = normalizeRequirements([
    { text: "Faixa de valor", quote: "Até 10 mil o fluxo é simplificado." },
    { text: "Faixa de valor", quote: "acima de 500 mil passa por análise adicional." },
  ], source);
  assert.equal(requirements.length, 2);
  assert.equal(requirements[1].quote, "Acima de 500 mil passa por análise adicional.");
});

test("full source survives a lossy summary and extraction coverage needs no reconfirmation", () => {
  const facts = { fluxo: "Contratação", sourceTranscript: "Fornecedor exclusivo exige carta de exclusividade.", coverage: [{ key: "fluxo", status: "coberto" }] };
  assert.match(buildKnownFactsBlock(facts), /Fornecedor exclusivo exige carta/);
  assert.doesNotMatch(buildKnownFactsBlock({ ...facts, visao_geral: "Dono inventado no resumo" }), /Dono inventado/);
  assert.equal(coverageFromFacts(facts).find((entry) => entry.key === "fluxo").status, "coberto");
  assert.equal(coverageFromFacts({ fluxo: "Resumo antigo" }).find((entry) => entry.key === "fluxo").status, "parcial");
});

test("rules and SLA survive sanitization, both editors and AI adjustment conversion", () => {
  const draft = sanitizePreMapping({ process: { name: "Compra" }, nodes: [
    { id: "s", kind: "start", label: "Início" },
    { id: "t", kind: "task", label: "Aprovar demanda", actor: "Gestor", description: "Lembrete após 72 horas, escalonamento após 120 horas.", sla: "48 horas" },
    { id: "e", kind: "end", label: "Fim" },
  ], edges: [{ source: "s", target: "t" }, { source: "t", target: "e" }] });
  for (const convert of [toReactFlow, preMappingToEditorFlow]) {
    const flow = convert(draft);
    assert.equal(flow.nodes.find((node) => node.id === "t").data.sla, "48 horas");
    const back = editorFlowToPreMapping(flow.nodes, flow.edges, draft);
    assert.match(back.nodes.find((node) => node.id === "t").description, /120 horas/);
  }
});

test("generation requires explicit gateways for alternative paths", () => {
  const nodes = [{ id: "task", kind: "task", label: "Analisar" }, { id: "gw", kind: "decision", label: "Faixa?" }];
  assert.equal(generatedBranchIssues(nodes, [{ source: "task" }, { source: "task" }]).length, 1);
  assert.deepEqual(generatedBranchIssues(nodes, [{ source: "task" }, { source: "gw" }, { source: "gw" }, { source: "gw" }]), []);
});
