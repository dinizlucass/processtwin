// Explicit opt-in: real AI calls and one clearly labeled test process.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { loadTs } from "../tests/load-ts.mjs";
if (process.env.E2E_LIVE !== "1") throw new Error("Set E2E_LIVE=1 to run against configured services.");
nextEnv.loadEnvConfig(process.cwd());
const { prepareMappingCommit } = loadTs("lib/mapping-commit.ts");
const { validateFlow } = loadTs("lib/flow-analysis.ts");
const { PHASE_KEYS } = loadTs("lib/phases.ts");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const base = process.env.E2E_BASE_URL || "http://localhost:3000";
const run = randomUUID();
const name = `E2E-${run.slice(0, 8)} Aprovação de acesso`;
const report = { run, name, started: new Date().toISOString(), checks: [], resources: {} };
fs.mkdirSync(".e2e", { recursive: true });
const reportPath = `.e2e/${run}.json`;
const saveReport = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
const step = async (label, action) => {
  const start = Date.now();
  try { const data = await action(); report.checks.push({ label, status: "pass", ms: Date.now() - start }); console.log("PASS", label, Date.now() - start, "ms"); saveReport(); return data; }
  catch (error) { report.checks.push({ label, status: "fail", message: error.message, ms: Date.now() - start }); saveReport(); throw error; }
};
async function json(path, body, status = 200) {
  const response = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(330000) });
  const data = await response.json();
  assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`); return data;
}
try {
  await step("migração 005 disponível", async () => {
    const { error } = await sb.rpc("save_process_flow", { p_process_id: randomUUID(), p_nodes: [], p_edges: [], p_expected_version: 1 });
    assert.match(error?.message ?? "", /Processo não encontrado/);
  });
  await step("migração 006 disponível", async () => {
    const { error } = await sb.rpc("commit_process_mapping", { p_request_id: randomUUID(), p_payload: {} });
    assert.match(error?.message ?? "", /INVALID_MAPPING_PAYLOAD/);
  });
  const transcript = `Cenário fictício para teste automatizado. Processo: ${name}. Área: E2E TI. Dono: E2E Responsável ${run.slice(0, 8)}. Objetivo: conceder acesso ao portal interno. O gatilho é um pedido no ServiceNow. O analista de TI recebe o pedido e valida os dados. O gestor avalia a autorização. Se aprovar, o analista provisiona o acesso no Microsoft Entra ID e notifica o solicitante, encerrando o processo. Se reprovar, o analista notifica a recusa e encerra o processo. O resultado é acesso concedido ou recusa comunicada. Não há outros caminhos. O processo é diário, dez pedidos por dia. SLA: quatro horas úteis. Só o gestor pode aprovar. Em erro técnico, o analista registra incidente no ServiceNow e tenta novamente após resolver. Dor: digitação manual gera retrabalho. Oportunidade: integrar ServiceNow ao Entra ID. Criticidade baixa. Não usa IA hoje.`;
  fs.writeFileSync(`.e2e/${run}-transcript.txt`, transcript);
  const extracted = await step("extração real de transcrição textual", async () => {
    const form = new FormData(); form.append("file", new Blob([transcript], { type: "text/plain" }), "transcricao.txt");
    const response = await fetch(base + "/api/extract-transcript", { method: "POST", body: form, signal: AbortSignal.timeout(120000) });
    const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data));
    assert.ok(PHASE_KEYS.every((key) => key in data.facts)); assert.ok(data.facts.fluxo);
    assert.equal(data.facts.sourceTranscript, transcript); assert.ok(data.facts.requirements.length > 0); return data;
  });
  const messages = [{ role: "user", text: transcript }];
  const interview = await step("entrevista real sem fallback", async () => {
    const data = await json("/api/copilot", { messages, facts: extracted.facts });
    assert.equal(data.source, "openai"); assert.ok(data.reply?.length); return data;
  });
  const generated = await step("geração real do pré-mapeamento", async () => {
    const data = await json("/api/copilot/generate", { messages, facts: extracted.facts, coverage: interview.coverage });
    assert.ok(data.draft.nodes.some((n) => n.kind === "task")); assert.ok(data.draft.edges.length >= 3); return data;
  });
  generated.draft.process.name = name;
  generated.draft.process.owner = `E2E Responsável ${run.slice(0, 8)}`;
  generated.draft.process.department = `E2E TI ${run.slice(0, 8)}`;
  report.structuralIssues = validateFlow(generated.draft.nodes.map((n) => ({ id: n.id, type: n.kind, position: { x: 0, y: 0 }, data: n })), generated.draft.edges);
  const conv = await step("gravação e leitura da conversa", async () => {
    const data = await json("/api/ai-conversation", { messages, extractedFields: extracted.facts });
    report.resources.conversationId = data.id; saveReport();
    const response = await fetch(base + `/api/ai-conversation?id=${data.id}`); const loaded = await response.json();
    assert.equal(response.status, 200, JSON.stringify(loaded));
    assert.equal(loaded.messages[0].text, transcript);
    assert.deepEqual(loaded.extractedFields, extracted.facts); return data;
  });
  const request = { requestId: randomUUID(), conversationId: conv.id, draft: generated.draft };
  fs.writeFileSync(`.e2e/${run}-request.json`, JSON.stringify(request, null, 2));
  const committed = await step("três commits concorrentes criam apenas um processo", async () => {
    const responses = await Promise.all([json("/api/mapping/commit", request), json("/api/mapping/commit", request), json("/api/mapping/commit", request)]);
    assert.equal(new Set(responses.map((r) => r.processId)).size, 1);
    assert.equal(responses.filter((r) => r.replayed).length, 2);
    report.resources.processId = responses[0].processId; saveReport(); return responses[0];
  });
  await step("conflito de idempotência sem duplicação", async () => {
    const changed = structuredClone(request); changed.draft.process.name += " alterado";
    await json("/api/mapping/commit", changed, 409);
    await json("/api/mapping/commit", { ...request, requestId: randomUUID() }, 409);
    const { data, error } = await sb.from("process").select("id").eq("name", name);
    assert.ifError(error); assert.equal(data.length, 1);
  });
  const readFlow = async () => {
    const [p, n, e] = await Promise.all([sb.from("process").select("*").eq("id", committed.processId).single(), sb.from("flow_node").select("*").eq("process_id", committed.processId), sb.from("flow_edge").select("*").eq("process_id", committed.processId)]);
    for (const r of [p, n, e]) assert.ifError(r.error); return { process: p.data, nodes: n.data, edges: e.data };
  };
  const persisted = await step("reabertura confirma processo, raias, arestas e vínculo", async () => {
    const data = await readFlow();
    const prepared = prepareMappingCommit(request);
    assert.equal(data.nodes.length, prepared.payload.nodes.length); assert.equal(data.edges.length, prepared.payload.edges.length);
    const conv = await sb.from("ai_conversation").select("process_id,status").eq("id", request.conversationId).single();
    assert.equal(conv.data.process_id, committed.processId); assert.equal(conv.data.status, "concluida"); return data;
  });
  const flow = {
    processId: committed.processId, expectedVersion: persisted.process.version,
    nodes: persisted.nodes.filter((n) => n.kind !== "lane").map((n) => ({ id: n.node_id, type: n.kind, position: { x: n.pos_x, y: n.pos_y }, data: { ...n.attributes, kind: n.kind, label: n.label, actor: n.actor, activityType: n.activity_type, tags: n.tags, usesAI: n.uses_ai } })),
    edges: persisted.edges.map((e) => ({ id: e.edge_id, source: e.source_id, target: e.target_id, sourceHandle: e.source_handle, label: e.label })),
    lanes: persisted.nodes.filter((n) => n.kind === "lane").map((n) => ({ id: n.node_id, label: n.label, posY: n.pos_y, colorIndex: n.attributes.colorIndex, height: n.attributes.height, order: n.attributes.order })),
  };
  const task = flow.nodes.find((n) => n.data.kind === "task"); task.position.x += 40; task.data.description = "Edição E2E preservada";
  await step("salvamento editado e rejeição de versão antiga", async () => {
    const saved = await json("/api/flow", flow); assert.equal(saved.version, flow.expectedVersion + 1);
    await json("/api/flow", flow, 409);
    const data = await readFlow(); const savedTask = data.nodes.find((n) => n.node_id === task.id);
    assert.equal(savedTask.pos_x, task.position.x); assert.equal(savedTask.attributes.description, task.data.description);
  });
  await step("rollback real de falha tardia no Supabase", async () => {
    const { payload } = prepareMappingCommit({ ...request, conversationId: null });
    payload.process.name = `E2E-ROLLBACK-${run}`; payload.owner.name = `E2E-ROLLBACK-OWNER-${run}`; payload.folder = `E2E-ROLLBACK-FOLDER-${run}`;
    payload.recommendations = [{ title: "Forçar falha de teste", priority: "INVALID" }];
    const key = randomUUID();
    const { error } = await sb.rpc("commit_process_mapping", { p_request_id: key, p_payload: payload });
    assert.match(error?.message ?? "", /check constraint/);
    for (const [table, column, value] of [["process", "name", payload.process.name], ["process_owner", "name", payload.owner.name], ["process_folder", "name", payload.folder], ["mapping_commit_request", "request_id", key]]) {
      const { data, error } = await sb.from(table).select("*").eq(column, value); assert.ifError(error); assert.equal(data.length, 0, table);
    }
  });
  if (fs.existsSync(".e2e/voice-sample.wav")) await step("transcrição real de áudio sintético WAV", async () => {
    const form = new FormData(); form.append("audio", new Blob([fs.readFileSync(".e2e/voice-sample.wav")], { type: "audio/wav" }), "voice-sample.wav");
    const response = await fetch(base + "/api/transcribe", { method: "POST", body: form, signal: AbortSignal.timeout(120000) });
    const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data));
    assert.ok(data.text?.length > 20); assert.match(data.text.toLowerCase(), /analista|pedido|solicita/); report.audioTranscript = data.text;
  });
  report.completed = new Date().toISOString(); saveReport();
  console.log("REPORT", reportPath); console.log("PROCESS", committed.processId);
} catch (error) { console.error(error.message); process.exitCode = 1; }
