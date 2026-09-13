import fs from "node:fs";
import nextEnv from "@next/env";
import OpenAI from "openai";
import { loadTs } from "../tests/load-ts.mjs";

if (process.env.E2E_LIVE !== "1") throw new Error("Set E2E_LIVE=1 for real model calls.");
const [sourceFile, ...models] = process.argv.slice(2);
if (!sourceFile || !models.length) throw new Error("Usage: node scripts/benchmark-mapping.mjs <transcript.txt> <model> [model...]");
nextEnv.loadEnvConfig(process.cwd());
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1, timeout: 240000 });
const effort = process.env.E2E_REASONING || "medium";
const { GENERATION_SYSTEM_PROMPT, GENERATION_TOOL } = loadTs("lib/copilot-prompt.ts");
const { sanitizePreMapping } = loadTs("lib/premapping.ts");
const { validateFlow } = loadTs("lib/flow-analysis.ts");
const source = fs.readFileSync(sourceFile, "utf8");
fs.mkdirSync(".e2e", { recursive: true });
for (const model of models) {
  const start = Date.now();
  const report = { date: new Date().toISOString(), model, effort };
  try {
    const response = await client.responses.create({
      model, ...(/^gpt-5/.test(model) ? { reasoning: { effort } } : {}), store: false,
      input: [{ role: "system", content: GENERATION_SYSTEM_PROMPT }, { role: "user", content: `TRANSCRIÇÃO ORIGINAL:\n${source}\nGere o mapa AS-IS completo. Registre lacunas sem inventar.` }],
      text: { format: { type: "json_schema", name: "premapping", schema: GENERATION_TOOL.function.parameters, strict: false } },
    });
    report.ms = Date.now() - start;
    report.usage = response.usage;
    report.finishReason = response.status;
    if (response.status !== "completed") throw new Error("Incomplete response");
    report.raw = JSON.parse(response.output_text);
    report.draft = sanitizePreMapping(report.raw);
    report.structuralIssues = validateFlow(report.draft.nodes.map((node) => ({ id: node.id, type: node.kind, data: node })), report.draft.edges);
    console.log(JSON.stringify({ model, ms: report.ms, usage: report.usage, nodes: report.draft.nodes.length, structuralIssues: report.structuralIssues }));
  } catch (error) {
    report.error = { name: error.name, status: error.status, code: error.code, message: error.message };
    console.log(JSON.stringify({ model, error: report.error }));
    process.exitCode = 1;
  }
  fs.writeFileSync(`.e2e/benchmark-${model.replace(/[^a-z0-9.-]/gi, "_")}-${effort}.json`, JSON.stringify(report, null, 2));
}
