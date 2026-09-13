// Reuse a real AI fidelity result to test persistence without paying for another generation.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadTs } from "../tests/load-ts.mjs";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
if (process.env.E2E_LIVE !== "1") throw new Error("Set E2E_LIVE=1 for real database writes.");
nextEnv.loadEnvConfig(process.cwd());
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fixture = JSON.parse(fs.readFileSync(process.argv[2] || ".e2e/fidelity.json", "utf8"));
assert.match(fixture.scenario, /Cenário fictício.*E2E/);
const base = process.env.E2E_BASE_URL || "http://localhost:3000";
const run = randomUUID();
const report = { run, date: new Date().toISOString(), checks: [] };
fs.mkdirSync(".e2e", { recursive: true });
const save = () => fs.writeFileSync(`.e2e/persistence-${run}.json`, JSON.stringify(report, null, 2));
async function request(path, body, expected = 200) {
  const response = await fetch(base + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}
async function check(name, action) { await action(); report.checks.push(name); save(); console.log("PASS", name); }
const facts = { sourceTranscript: fixture.scenario, visao_geral: `Nome: E2E-${run} Persistência`, requirements: [], coverage: [] };
const conversation = await request("/api/ai-conversation", { messages: [{ role: "ai", text: "Transcrição de teste extraída." }], extractedFields: facts });
report.conversationId = conversation.id; save();
await check("upload sem resposta pode ser reaberto e aparece no histórico", async () => {
  const loaded = await request(`/api/ai-conversation?id=${conversation.id}`);
  assert.deepEqual(loaded.extractedFields, facts);
  const recent = await request("/api/ai-conversation?recent=1");
  assert.ok(recent.conversations.some((entry) => entry.id === conversation.id));
});
const draft = structuredClone(fixture.data.draft);
draft.process.name = `E2E-${run.slice(0, 8)} Persistência`;
const task = draft.nodes.find((node) => node.kind === "task");
task.description = "Descrição preservada pelo commit atômico"; task.sla = "2 horas úteis";
const payload = { requestId: randomUUID(), conversationId: conversation.id, draft };
await check("três commits concorrentes resultam em um processo e dois replays", async () => {
  const results = await Promise.all([request("/api/mapping/commit", payload), request("/api/mapping/commit", payload), request("/api/mapping/commit", payload)]);
  assert.equal(new Set(results.map((result) => result.processId)).size, 1);
  assert.equal(results.filter((result) => result.replayed).length, 2);
  report.processId = results[0].processId;
});
await check("conteúdo alterado com a mesma chave retorna conflito", async () => {
  const changed = structuredClone(payload); changed.draft.process.name += " alterado";
  await request("/api/mapping/commit", changed, 409);
});
await check("conversa fica vinculada e autosave atrasado é rejeitado", async () => {
  const loaded = await request(`/api/ai-conversation?id=${conversation.id}`);
  assert.equal(loaded.processId, report.processId);
  await request("/api/ai-conversation", { id: conversation.id, messages: [], extractedFields: {} }, 409);
});
const { prepareMappingCommit } = loadTs("lib/mapping-commit.ts");
const prepared = prepareMappingCommit(payload);
await check("descrição e SLA chegam à persistência", async () => {
  const node = await db.from("flow_node").select("attributes").eq("process_id", report.processId).eq("node_id", task.id).single();
  const edges = await db.from("flow_edge").select("edge_id").eq("process_id", report.processId);
  assert.ifError(node.error); assert.ifError(edges.error);
  assert.equal(node.data.attributes.description, task.description); assert.equal(node.data.attributes.sla, task.sla);
  assert.equal(edges.data.length, prepared.payload.edges.length);
});
console.log("REPORT", `.e2e/persistence-${run}.json`);
