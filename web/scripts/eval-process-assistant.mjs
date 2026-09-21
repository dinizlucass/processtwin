// Run against a local or staging server.
// Does not print process data or secrets.
const base = process.env.PROCESS_ASSISTANT_BASE_URL || "http://localhost:3000";

const cases = [
  { question: "Quantos processos estão mapeados?", expect: /\d+ processos mapeados de \d+/, source: true },
  { question: "Qual a cobertura de mapeamento?", expect: /\d+%/, source: true },
  { question: "Quantos processos críticos existem?", expect: /\d+ processos (de|com) criticidade alta/, source: true },
  { question: "Quantos processos estão com a revisão atrasada?", expect: /\d+ processos com revisão vencida/, source: true },
  { question: "Quantos processos estão sem responsável?", expect: /\d+ processos sem responsável/, source: true },
  { question: "Quais processos usam SAP?", expect: /processos registram uso de SAP|Nenhum processo registra SAP/, source: false },
  { question: "Quais processos se relacionam entre si?", expect: /relações confirmadas|Não há relações confirmadas/, source: false },
  { question: "Qual foi o tempo médio real de aprovação nos últimos 30 dias?", expect: /não tenho dados de execução/i, source: false },
  { question: "Quantas execuções reais ocorreram no último mês?", expect: /não tenho dados de execução/i, source: false },
  { question: "Como funciona o processo de colheita lunar?", expect: /não|falta|ausente|evidên/i, source: false },
];

let passed = 0;
for (const entry of cases) {
  const response = await fetch(`${base}/api/process-assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: entry.question }),
  });
  const body = await response.json();
  const sourceIds = new Set((body.sources || []).map((s) => s.id));
  const citations = [...(body.answer || "").matchAll(/\[P\d+\]/g)].map((m) => m[0].slice(1, -1));
  const valid = response.ok && entry.expect.test(body.answer || "") && (!entry.source || body.sources?.length > 0) && citations.every((id) => sourceIds.has(id));
  console.log(`${valid ? "PASS" : "FAIL"} ${entry.question} (${response.status}, ${body.sources?.length || 0} fontes)`);
  if (valid) passed++;
}

console.log(`${passed}/${cases.length} verificações passaram`);
if (passed !== cases.length) process.exitCode = 1;
