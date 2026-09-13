// Scenario-specific regression criteria for the procurement workshop, not a BPMN certification.
import fs from "node:fs";
import assert from "node:assert/strict";
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const draft = report.draft ?? report.stages?.["/api/copilot/generate"]?.data?.draft;
assert.ok(draft, "Report has no draft");
const normalize = (text) => String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const textOf = (node) => normalize(`${node.label} ${node.actor ?? ""} ${node.description ?? ""}`);
const tasks = draft.nodes.filter((node) => node.kind === "task");
const decisions = draft.nodes.filter((node) => node.kind === "decision");
const matches = (pattern) => tasks.filter((node) => pattern.test(textOf(node)));
const quoteTasks = matches(/(?:tres|3) cotac/);
const managers = matches(/aprova/).filter((node) => /gestor.*(?:solicitante|requisitante|area)/.test(textOf(node)) && !/gestor de compras/.test(textOf(node)));
function reachable(start, goal, excluded = new Set()) {
  const queue = [start]; const seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (seen.has(current) || excluded.has(current)) continue;
    if (current === goal) return true;
    seen.add(current);
    for (const edge of draft.edges) if (edge.source === current) queue.push(edge.target);
  }
  return false;
}
const starts = draft.nodes.filter((node) => node.kind === "start");
const evidence = normalize(JSON.stringify([draft.requirements, draft.traceability, draft.recommendations]));
const valueText = normalize(JSON.stringify(decisions) + JSON.stringify(draft.edges));
const checks = {
  compliance: matches(/compliance/).some((node) => /analis|avali|revis/.test(textOf(node))),
  legal: matches(/juridic/).some((node) => /analis|avali|revis|ajust/.test(textOf(node))),
  threeQuotes: quoteTasks.length > 0,
  valueBranches: /10\s*(?:mil|\.000|000)/.test(valueText) && /100\s*(?:mil|\.000|000)/.test(valueText) && /500\s*(?:mil|\.000|000)/.test(valueText),
  exclusivity: matches(/carta.*exclusiv/).length > 0 && decisions.some((node) => /exclusiv/.test(textOf(node))),
  emergency: matches(/justificativa.*emerg|emerg.*justificativa/).length > 0 && matches(/diretoria/).length > 0,
  regulatoryGap: /regulator/.test(evidence),
  rolesInsteadOfNames: tasks.every((node) => !/\b(juliana|carlos|fernanda|lucas|rafael|andre|mariana)\b/.test(normalize(node.actor))),
  noInventedOwnerOrCriticality: !draft.process.owner && !draft.process.criticality,
  managerBeforeQuotes: managers.length > 0 && quoteTasks.length > 0 && quoteTasks.every((quote) => starts.every((start) => !reachable(start.id, quote.id, new Set(managers.map((node) => node.id))))),
};
console.log(JSON.stringify({ model: report.model, checks, passed: Object.values(checks).filter(Boolean).length, total: Object.keys(checks).length }, null, 2));
if (Object.values(checks).some((passed) => !passed)) process.exitCode = 1;
