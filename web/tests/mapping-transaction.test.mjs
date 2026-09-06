import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { loadTs } from "./load-ts.mjs";
const { prepareMappingCommit } = loadTs("lib/mapping-commit.ts");
const { flowRows, parseFlow } = loadTs("lib/flow-persistence.ts");
export const draft = {
  process: { name: "E2E Solicitação de acesso", owner: "E2E Responsável", department: "E2E TI", criticality: "baixa" },
  nodes: [{ id: "s", kind: "start", label: "Início" }, { id: "t", kind: "task", label: "Validar pedido", actor: "E2E Analista", systems: ["SAP"] }, { id: "e", kind: "end", label: "Fim" }],
  edges: [{ source: "s", target: "t" }, { source: "t", target: "e" }],
  systems: [{ name: "sap", isPrimary: true }], recommendations: [{ title: "Medir SLA", priority: "P2" }],
};
const read = (file) => fs.readFileSync(new URL(`../supabase/${file}`, import.meta.url), "utf8");

test("atomic mapping and save functions execute against PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(read("schema.sql").split("-- ============ SEED")[0].replace('create extension if not exists "pgcrypto";', ''));
  await db.exec(read("migrations/003_folders.sql"));
  await db.exec(read("migrations/005_atomic_flow_save.sql"));
  await db.exec(read("migrations/006_atomic_mapping_commit.sql"));
  const conversationId = randomUUID();
  await db.query("insert into ai_conversation(id) values ($1)", [conversationId]);
  const prepared = prepareMappingCommit({ requestId: randomUUID(), conversationId, draft });
  const commit = (key, payload) => db.query("select commit_process_mapping($1, $2::jsonb) as result", [key, JSON.stringify(payload)]).then((r) => r.rows[0].result);
  const count = (table) => db.query(`select count(*)::int as count from ${table}`).then((r) => r.rows[0].count);
  let saved;
  await t.test("one commit creates the complete aggregate and links conversation", async () => {
    saved = await commit(prepared.requestId, prepared.payload);
    assert.equal(saved.version, 1);
    for (const table of ["process", "process_owner", "process_folder", "system_dependency", "improvement_opportunity", "mapping_commit_request"]) assert.equal(await count(table), 1, table);
    assert.equal(await count("flow_node"), prepared.payload.nodes.length);
    assert.equal(await count("flow_edge"), 2);
    const { rows } = await db.query("select status, process_id from ai_conversation where id=$1", [conversationId]);
    assert.equal(rows[0].status, "concluida"); assert.equal(rows[0].process_id, saved.processId);
  });
  await t.test("retry returns the same process without duplicate rows", async () => {
    const replay = await commit(prepared.requestId, prepared.payload);
    assert.equal(replay.processId, saved.processId); assert.equal(replay.replayed, true);
    assert.equal(await count("process"), 1);
  });
  await t.test("same key with changed payload and second key for same conversation conflict", async () => {
    await assert.rejects(commit(prepared.requestId, { ...prepared.payload, folder: "other" }), /IDEMPOTENCY_CONFLICT/);
    await assert.rejects(commit(randomUUID(), prepared.payload), /CONVERSATION_ALREADY_COMMITTED/);
    assert.equal(await count("process"), 1);
  });
  await t.test("late failure rolls back process, owner, folder, nodes, edges, systems and ledger", async () => {
    const failed = structuredClone(prepared.payload);
    failed.conversation_id = null; failed.owner.name = "Rollback owner"; failed.folder = "Rollback folder";
    failed.recommendations[0].priority = "INVALID";
    const key = randomUUID();
    await assert.rejects(commit(key, failed), /check constraint/);
    for (const table of ["process", "process_owner", "process_folder", "system_dependency", "improvement_opportunity", "mapping_commit_request"]) assert.equal(await count(table), 1, table);
    assert.equal(await count("flow_node"), prepared.payload.nodes.length);
    assert.equal(await count("flow_edge"), 2);
    failed.recommendations[0].priority = "P1";
    await commit(key, failed); // a rolled back attempt does not consume the key
    assert.equal(await count("process"), 2);
  });
  await t.test("invalid conversation cannot create an orphan process", async () => {
    await assert.rejects(commit(randomUUID(), { ...prepared.payload, conversation_id: randomUUID() }), /CONVERSATION_NOT_FOUND/);
    assert.equal(await count("process"), 2);
  });
  await t.test("save preserves old flow on failure and rejects stale versions", async () => {
    const nodes = prepared.payload.nodes;
    const save = (n, v) => db.query("select save_process_flow($1,$2::jsonb,$3::jsonb,$4) as version", [saved.processId, JSON.stringify(n), JSON.stringify(prepared.payload.edges), v]);
    await assert.rejects(save([...nodes, nodes[0]], 1), /duplicate key/);
    assert.equal((await db.query("select count(*)::int as count from flow_node where process_id=$1", [saved.processId])).rows[0].count, nodes.length);
    assert.equal((await save(nodes, 1)).rows[0].version, 2);
    await assert.rejects(save(nodes, 1), /FLOW_VERSION_CONFLICT/);
  });
  await t.test("anonymous callers cannot execute commit or read idempotency payloads", async () => {
    const result = await db.query("select has_function_privilege('anon','commit_process_mapping(uuid,jsonb)','execute') as execute, has_table_privilege('anon','mapping_commit_request','select') as read");
    assert.equal(result.rows[0].execute, false); assert.equal(result.rows[0].read, false);
  });
});

test("edited flow keeps coordinates, lanes, attributes and additional node kinds", () => {
  const flow = { nodes: [{ id: "sub", position: { x: 420, y: 35 }, data: { kind: "subprocess", label: "Subprocesso editado", description: "Detalhe", sla: "2h", tags: ["teste"], usesAI: true, systems: ["SAP", "sap"], activityType: "automatizada" } }], edges: [], lanes: [{ id: "lane", label: "Equipe", posY: 0, colorIndex: 0, height: 180, order: 0 }] };
  const { payload } = prepareMappingCommit({ requestId: randomUUID(), draft, flow });
  const row = payload.nodes.find((n) => n.node_id === "sub");
  assert.equal(row.kind, "subprocess"); assert.equal(row.pos_x, 420); assert.equal(row.uses_ai, true);
  assert.equal(row.attributes.description, "Detalhe"); assert.equal(row.attributes.sla, "2h");
  assert.equal(payload.nodes.find((n) => n.kind === "lane").attributes.height, 180);
  assert.equal(payload.systems.length, 1);
  assert.equal(flow.nodes[0].data.systems.length, 2, "input must not be mutated");
});

test("invalid ids, endpoints and typed attributes fail before persistence", () => {
  assert.throws(() => prepareMappingCommit({ draft }), /idempotência/);
  assert.throws(() => prepareMappingCommit({ requestId: randomUUID(), draft: { ...draft, nodes: [...draft.nodes, draft.nodes[0]] } }), /repetidos/);
  assert.throws(() => prepareMappingCommit({ requestId: randomUUID(), draft: { ...draft, edges: [{ source: "s", target: "missing" }] } }), /conexões inválidas/);
  assert.throws(() => flowRows(parseFlow({ nodes: [{ id: "x", position: { x: 0, y: 0 }, data: { kind: "task", label: "x", systems: "sap" } }], edges: [] })), /Fluxo inválido/);
});
