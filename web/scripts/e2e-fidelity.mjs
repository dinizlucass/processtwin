import fs from "node:fs";
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { loadTs } from "../tests/load-ts.mjs";
if (process.env.E2E_LIVE !== "1") throw new Error("Set E2E_LIVE=1 for real services.");
nextEnv.loadEnvConfig(process.cwd());
const base = process.env.E2E_BASE_URL || "http://localhost:3000";
const { validateFlow } = loadTs("lib/flow-analysis.ts");
const scenario = "Cenário fictício: E2E Fidelidade. Área E2E Qualidade, dono E2E Supervisor, criticidade baixa. Todas as atividades são MANUAIS e usam ServiceNow. O analista recebe e confere o pedido. Há exatamente uma decisão: dados completos? Sim: registrar aprovação, notificar solicitante e encerrar. Não: registrar recusa, notificar solicitante e encerrar. Não há outros caminhos, decisões ou exceções neste cenário. Não há automação existente. Frequência diária; SLA 2 horas; dor retrabalho; melhoria sugerida validar campos automaticamente no futuro. Não acrescente cargos ao executor: ele é apenas Analista.";
const start = Date.now();
const response = await fetch(base + "/api/copilot/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", text: scenario }] }), signal: AbortSignal.timeout(120000) });
const data = await response.json();
fs.mkdirSync(".e2e", { recursive: true });
fs.writeFileSync(".e2e/fidelity.json", JSON.stringify({ date: new Date().toISOString(), ms: Date.now() - start, scenario, data }, null, 2));
assert.equal(response.status, 200, JSON.stringify(data));
assert.equal(data.draft.process.criticality, "baixa");
assert.equal(data.draft.process.department, "E2E Qualidade");
assert.equal(data.draft.process.usesAI, false);
assert.equal(data.draft.nodes.filter((n) => n.kind === "decision").length, 1);
for (const task of data.draft.nodes.filter((n) => n.kind === "task")) {
  assert.equal(task.activityType, "manual");
  assert.match(task.actor, /^analista$/i);
}
assert.deepEqual(validateFlow(data.draft.nodes.map((n) => ({ id: n.id, type: n.kind, data: n })), data.draft.edges), []);
console.log("PASS fidelidade: área, criticidade, executor, atividade manual, uma decisão e caminhos completos");

// A previous run id is explicit; never mutate arbitrary user conversations.
if (process.env.E2E_REPORT) {
  const report = JSON.parse(fs.readFileSync(process.env.E2E_REPORT, "utf8"));
  assert.ok(report.name.startsWith("E2E-"));
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const before = await sb.from("ai_conversation").select("*").eq("id", report.resources.conversationId).single();
  assert.ifError(before.error); assert.equal(before.data.process_id, report.resources.processId);
  const stale = await fetch(base + "/api/ai-conversation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: report.resources.conversationId, messages: [], extractedFields: {}, status: "em_andamento" }) });
  assert.equal(stale.status, 409);
  const after = await sb.from("ai_conversation").select("*").eq("id", report.resources.conversationId).single();
  assert.deepEqual(after.data, before.data);
  console.log("PASS autosave atrasado não desassocia nem reabre conversa concluída");
}
