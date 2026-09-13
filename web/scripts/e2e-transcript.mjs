import fs from "node:fs";
import assert from "node:assert/strict";
import { loadTs } from "../tests/load-ts.mjs";

if (process.env.E2E_LIVE !== "1") throw new Error("Set E2E_LIVE=1 to call real AI services.");
const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node scripts/e2e-transcript.mjs <transcript.txt>");
const base = process.env.E2E_BASE_URL || "http://localhost:3000";
const text = fs.readFileSync(inputPath, "utf8");
const output = `.e2e/transcript-${Date.now()}.json`;
fs.mkdirSync(".e2e", { recursive: true });
const report = { date: new Date().toISOString(), stages: {} };
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2));
async function request(path, body) {
  const start = Date.now();
  const response = await fetch(base + path, {
    method: "POST", ...(body instanceof FormData ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(330000),
  });
  const data = await response.json();
  report.stages[path] = { ms: Date.now() - start, status: response.status, data }; save();
  assert.equal(response.status, 200, JSON.stringify(data));
  console.log(`PASS ${path} (${Date.now() - start}ms)`);
  return data;
}
const form = new FormData();
form.append("file", new Blob([text], { type: "text/plain" }), "transcript.txt");
const extraction = await request("/api/extract-transcript", form);
assert.equal(extraction.facts.sourceTranscript, text);
assert.ok(extraction.facts.requirements.length > 0, "No evidence inventory extracted");
const interview = await request("/api/copilot", { facts: extraction.facts, messages: [
  { role: "ai", text: extraction.mensagem_inicial },
  { role: "user", text: "Use o que está explícito na transcrição. Não tenho detalhes adicionais; registre lacunas sem inventar." },
] });
const { draft } = await request("/api/copilot/generate", { facts: extraction.facts, coverage: interview.coverage, messages: [] });
assert.equal(draft.traceability.length, extraction.facts.requirements.length);
const { validateFlow } = loadTs("lib/flow-analysis.ts");
report.structuralIssues = validateFlow(draft.nodes.map((node) => ({ id: node.id, type: node.kind, data: node })), draft.edges);
report.summary = { nodes: draft.nodes.length, tasks: draft.nodes.filter((node) => node.kind === "task").length, decisions: draft.nodes.filter((node) => node.kind === "decision").length, requirements: draft.requirements.length, pending: draft.traceability.filter((entry) => entry.status === "pending").length };
save();
assert.deepEqual(report.structuralIssues, []);
console.log(JSON.stringify({ output, ...report.summary }));
