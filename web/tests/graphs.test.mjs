import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
function load(file) {
  const source = fs.readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = { exports: {} };
  new Function("module", "exports", js)(result, result.exports);
  return result.exports;
}
const { arrangeFlow, validateFlow } = load("flow-analysis.ts");
const { buildProcessGraph } = load("process-graph.ts");
const node = (id, kind, y = 0) => ({ id, type: kind, data: { kind, label: id }, position: { x: 0, y } });
test("layout terminates for cycles and disconnected components", () => {
  const nodes = [node("a", "task"), node("b", "task"), node("c", "task")];
  const result = arrangeFlow(nodes, [{ source: "a", target: "b" }, { source: "b", target: "a" }]);
  assert.equal(result.length, 3);
  assert.equal(new Set(result.map((n) => JSON.stringify(n.position))).size, 3);
  assert.deepEqual(nodes[0].position, { x: 0, y: 0 });
});
test("layout preserves lane membership and expands lane width", () => {
  const nodes = [node("lane", "lane"), node("a", "task", 30), node("b", "task", 170)];
  const result = arrangeFlow(nodes, [{ source: "a", target: "b" }]);
  assert.equal(result[1].position.y, 30);
  assert.equal(result[2].position.y, 170);
  assert.ok(result[0].width >= result[2].position.x + 176);
});
test("validation accepts complete path and detects unreachable tasks", () => {
  const nodes = [node("s", "start"), node("t", "task"), node("e", "end")];
  const edges = [{ source: "s", target: "t" }, { source: "t", target: "e" }];
  assert.deepEqual(validateFlow(nodes, edges), []);
  assert.ok(validateFlow([...nodes, node("orphan", "task")], edges).some((s) => s.includes("não é alcançável")));
});
test("validation detects incomplete decisions", () => {
  assert.ok(validateFlow([node("d", "decision")], []).some((s) => s.includes("dois caminhos")));
});
test("graph deduplicates system aliases and preserves directed handoffs", () => {
  const graph = buildProcessGraph([{ id: "a", name: "A" }, { id: "b", name: "B" }], [], { a: [" SAP ", "sap", "SÁP"] },
    { showFolders: false, showDepartments: false, showSystems: true, showHandoffs: true, colorBy: "folder" },
    [{ source: "a", target: "b", confirmed: true }, { source: "a", target: "missing", confirmed: false }]);
  assert.equal(graph.links.filter((l) => l.kind === "system").length, 1);
  assert.deepEqual(graph.nodes.find((n) => n.type === "system").memberProcessIds, ["a"]);
  const handoffs = graph.links.filter((l) => l.kind === "handoff");
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].source, "proc:a");
  assert.equal(handoffs[0].target, "proc:b");
});

test("validation detects closed cycles but accepts loops with an exit", () => {
  const nodes = [node("s", "start"), node("a", "task"), node("b", "task"), node("e", "end")];
  const edges = [{ source: "s", target: "a" }, { source: "a", target: "b" }, { source: "b", target: "a" }];
  assert.ok(validateFlow(nodes, edges).some((issue) => issue.includes("não há caminho")));
  assert.deepEqual(validateFlow(nodes, [...edges, { source: "b", target: "e" }]), []);
});
test("exclusive gateway may merge two inputs into one output", () => {
  const nodes = [node("s", "start"), node("a", "task"), node("b", "task"), node("merge", "decision"), node("e", "end")];
  const edges = [{ source: "s", target: "a" }, { source: "s", target: "b" }, { source: "a", target: "merge" }, { source: "b", target: "merge" }, { source: "merge", target: "e" }];
  assert.deepEqual(validateFlow(nodes, edges), []);
});
test("validation rejects invalid event direction and orphan endpoints", () => {
  const issues = validateFlow([node("s", "start"), node("e", "end")], [{ source: "e", target: "s" }, { source: "s", target: "missing" }]);
  assert.ok(issues.some((issue) => issue.includes("não deve receber")));
  assert.ok(issues.some((issue) => issue.includes("não deve emitir")));
  assert.ok(issues.some((issue) => issue.includes("inexistente")));
});
