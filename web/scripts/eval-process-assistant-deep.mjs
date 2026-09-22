// Ground-truth evaluation against a local/staging server and its Supabase catalog.
// Read-only: does not change processes or print credentials.
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());

const base = process.env.PROCESS_ASSISTANT_BASE_URL || "http://localhost:3000";
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const select = async (table, columns) => {
  const out = [];
  for (let start = 0; start < 20000; start += 500) {
    const { data, error } = await db.from(table).select(columns).range(start, start + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 500) return out;
  }
  throw new Error(`Consulta incompleta: ${table}`);
};

const [processes, nodes, relationships, systems, pains] = await Promise.all([
  select("process", "id,name,code,status,criticality,department,owner_id,last_reviewed_at"),
  select("flow_node", "process_id,node_id,kind,label,attributes"),
  select("process_relationship", "from_process,to_process,label"),
  select("system_dependency", "process_id,system_name"),
  select("process_pain_point", "process_id,description"),
]);
const selected = process.env.PROCESS_ASSISTANT_SCOPE === "published" ? processes.filter((p) => p.status === "publicado") : processes;
const ids = new Set(selected.map((p) => p.id));
const mappedIds = new Set(nodes.filter((n) => ids.has(n.process_id) && n.kind !== "lane").map((n) => n.process_id));
const critical = selected.filter((p) => p.criticality === "alta");
const criticalMapped = critical.filter((p) => mappedIds.has(p.id)).length;
const published = selected.filter((p) => p.status === "publicado");
const publishedMapped = published.filter((p) => mappedIds.has(p.id)).length;
const compras = selected.filter((p) => p.department === "Compras");
const comprasMapped = compras.filter((p) => mappedIds.has(p.id)).length;
const sapIds = new Set([
  ...systems.filter((s) => ids.has(s.process_id) && norm(s.system_name).includes("sap")).map((s) => s.process_id),
  ...nodes.filter((n) => ids.has(n.process_id) && Array.isArray(n.attributes?.systems) && n.attributes.systems.some((s) => norm(s).includes("sap"))).map((n) => n.process_id),
]);
const confirmed = relationships.filter((r) => ids.has(r.from_process) && ids.has(r.to_process));

let passed = 0;
let total = 0;
const failures = [];
async function ask(question, history = []) {
  const begin = performance.now();
  const res = await fetch(`${base}/api/process-assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });
  const body = await res.json();
  const sourceIds = new Set((body.sources || []).map((s) => s.id));
  const citations = [...String(body.answer || "").matchAll(/\[P\d+\]/g)].map((m) => m[0].slice(1, -1));
  return { ...body, status: res.status, ms: Math.round(performance.now() - begin), citationsValid: citations.every((id) => sourceIds.has(id)) };
}
async function check(label, question, validate, repeat = 1) {
  for (let i = 0; i < repeat; i++) {
    total++;
    try {
      const result = await ask(question);
      const ok = result.status === 200 && result.citationsValid && validate(result);
      console.log(`${ok ? "PASS" : "FAIL"} ${label} #${i + 1} (${result.ms}ms, ${result.sources?.length || 0} fontes)`);
      if (ok) passed++;
      else failures.push({ label, question, answer: String(result.answer || result.error).slice(0, 700) });
    } catch (error) {
      console.log(`FAIL ${label} #${i + 1}: ${error.message}`);
      failures.push({ label, error: error.message });
    }
  }
}

await check("total", "Quantos processos existem no repositório?", (r) => r.answer.includes(`Há ${selected.length} processos`), 3);
await check("mapeados", "Quantos processos estão mapeados?", (r) => r.answer.includes(`${mappedIds.size} processos mapeados de ${selected.length}`), 3);
await check("críticos mapeados", "Quantos processos críticos estão mapeados?", (r) => r.answer.includes(`${criticalMapped} processos mapeados de ${critical.length}`), 3);
await check("publicados mapeados", "Quantos processos publicados estão mapeados?", (r) => r.answer.includes(`${publishedMapped} processos mapeados de ${published.length}`), 3);
await check("Compras mapeados", "Quantos processos da área Compras estão mapeados?", (r) => r.answer.includes(`${comprasMapped} processos mapeados de ${compras.length}`), 3);
await check("SAP", "Quais processos usam SAP?", (r) => {
  const got = new Set((r.sources || []).map((s) => s.href.split("/").pop()));
  const countMatches = r.answer.includes(`${sapIds.size} processos com SAP como sistema`);
  return countMatches && got.size === sapIds.size && [...got].every((id) => sapIds.has(id));
}, 2);
await check("contagem SAP", "Quantos processos têm SAP como sistema?", (r) => r.answer.includes(`${sapIds.size} processos com SAP como sistema`), 3);
await check("SAP mapeados", "Quantos processos com SAP estão mapeados?", (r) => r.answer.includes(`${[...sapIds].filter((id) => mappedIds.has(id)).length} processos mapeados com SAP como sistema`), 3);
await check("relações", "Quais processos se relacionam entre si?", (r) => confirmed.length === 0 ? /Não há relações confirmadas/.test(r.answer) : r.answer.includes(`${confirmed.length} relações confirmadas`), 2);
await check("dores formais", "Quais dores foram registradas?", (r) => pains.length === 0 ? /Nenhuma dor está formalmente registrada/.test(r.answer) : r.answer.includes(`${pains.length} dores formalmente registradas`), 2);

const duplicate = selected.find((p) => selected.filter((x) => x.name === p.name).length > 1);
if (duplicate) await check("nome duplicado", `Como é o fluxo do processo ${duplicate.name}?`, (r) => /Encontrei \d+ registros/.test(r.answer) && r.sources.length > 1, 2);

const flowCases = [
  { name: "Reembolso de Despesas de Viagem", terms: ["formulario", "comprovantes", "gestor", "pagamento", "lancamento contabil"] },
  { name: "E2E-c4520e9d-P01 Planejamento de demanda", terms: ["previs", "demanda", "diverg", "justificativa", "aprova"] },
  { name: "E2E-c4520e9d-P02 Abertura de requisição de compra", terms: ["requisicao", "orcament", "libera"] },
];
for (const flow of flowCases) {
  const p = selected.find((x) => x.name === flow.name);
  if (!p) continue;
  await check(`fluxo ${p.code || p.name}`, `Como é o fluxo do processo ${p.name}?`, (r) => {
    const text = norm(r.answer);
    return r.sources?.length === 1 && r.sources[0].href === `/modelagem/${p.id}` && /\[P1\]/.test(r.answer) && flow.terms.every((term) => text.includes(term));
  }, 3);
}

const reimbursement = selected.find((p) => p.name === "Reembolso de Despesas de Viagem");
if (reimbursement) {
  const originalQuestion = `Como é o fluxo do processo ${reimbursement.name}?`;
  const first = await ask(originalQuestion);
  const history = [{ role: "user", content: originalQuestion }, { role: "assistant", content: String(first.answer || "").slice(0, 1000) }];
  for (let i = 0; i < 3; i++) {
    total++;
    const follow = await ask("Quem valida os comprovantes?", history);
    const ok = follow.status === 200 && follow.citationsValid && follow.sources?.length === 1 && follow.sources[0].href === `/modelagem/${reimbursement.id}` && norm(follow.answer).includes("financeir");
    console.log(`${ok ? "PASS" : "FAIL"} acompanhamento de fluxo #${i + 1} (${follow.ms}ms, ${follow.sources?.length || 0} fontes)`);
    if (ok) passed++; else failures.push({ label: "acompanhamento de fluxo", answer: String(follow.answer || follow.error).slice(0, 700) });
  }
}

await check("KPI operacional indisponível", "Qual foi o tempo médio real de aprovação nos últimos 30 dias?", (r) => /não tenho dados de execução/i.test(r.answer) && !r.sources?.length, 2);
await check("processo inexistente", "Como funciona o processo de colheita lunar?", (r) => !r.sources?.length && /não encontrei|não há|não tenho/i.test(r.answer), 2);

total++;
const unauthorized = await fetch(`${base}/api/process-assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "Quantos processos?" }) });
const authOk = unauthorized.status === 200;
console.log(`${authOk ? "PASS" : "FAIL"} acesso livre ao assistente (${unauthorized.status})`);
if (authOk) passed++; else failures.push({ label: "auth", status: unauthorized.status });

console.log(`${passed}/${total} verificações passaram`);
if (failures.length) console.log(JSON.stringify({ failures }, null, 2));
if (passed !== total) process.exitCode = 1;
