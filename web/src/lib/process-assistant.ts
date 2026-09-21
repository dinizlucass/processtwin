export interface AssistantProcess {
  id: string;
  status?: string;
  name: string;
  code: string | null;
  department: string | null;
  criticality: string | null;
  version: number;
  objective: string | null;
  scope: string | null;
  trigger_desc: string | null;
  inputs: string | null;
  outputs: string | null;
  frequency: string | null;
  sla: string | null;
  last_reviewed_at: string | null;
  owner?: { name: string } | null;
}

export interface AssistantNode {
  process_id: string;
  node_id: string;
  kind: string;
  label: string;
  actor: string | null;
  activity_type: string | null;
  uses_ai: boolean | null;
  attributes: Record<string, unknown> | null;
}

export interface AssistantRelationship {
  from_process: string;
  to_process: string;
  kind: string;
  label: string | null;
}

export interface AssistantEdge {
  process_id: string;
  source_id: string;
  target_id: string;
  label: string | null;
}

export interface AssistantFact {
  process_id: string;
  description?: string;
  title?: string;
  system_name?: string;
  is_primary?: boolean | null;
}

export interface AssistantCatalog {
  warnings?: string[];
  scopeLabel?: string;
  processes: AssistantProcess[];
  nodes: AssistantNode[];
  edges: AssistantEdge[];
  relationships: AssistantRelationship[];
  systems: AssistantFact[];
  pains: AssistantFact[];
  opportunities: AssistantFact[];
}

const STOP = new Set(["qual", "quais", "quantos", "quantas", "sobre", "para", "como", "onde", "quem", "com", "dos", "das", "uma", "processo", "processos", "atividade", "atividades", "meu", "nosso", "tem", "sao", "estao", "existe", "existem"]);

export function searchTerms(text: string): string[] {
  return [...new Set(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t)))];
}

export function catalogKpis(catalog: AssistantCatalog, now = new Date()) {
  const ids = new Set(catalog.processes.map((p) => p.id));
  const mapped = new Set(catalog.nodes.filter((n) => ids.has(n.process_id) && n.kind !== "lane").map((n) => n.process_id));
  const windows: Record<string, number> = { alta: 365, media: 548, baixa: 730 };
  const overdue = catalog.processes.filter((p) => {
    if (!p.last_reviewed_at || !p.criticality || !windows[p.criticality]) return false;
    return Math.floor((now.getTime() - new Date(`${p.last_reviewed_at}T00:00:00Z`).getTime()) / 86400000) > windows[p.criticality];
  });
  const withoutReview = catalog.processes.filter((p) => !p.last_reviewed_at);
  const byDepartment: Record<string, number> = {};
  for (const p of catalog.processes) byDepartment[p.department || "Sem área"] = (byDepartment[p.department || "Sem área"] || 0) + 1;
  const total = catalog.processes.length;
  return {
    scope: [catalog.scopeLabel || "Somente processos publicados; indicadores de cadastro/mapeamento, não de execução real", ...(catalog.warnings || [])].join(". "),
    asOf: now.toISOString(),
    definitions: {
      mapped: "processo com ao menos um nó de fluxo que não seja raia",
      overdue: "última revisão excede 365/548/730 dias conforme criticidade alta/média/baixa; sem data de revisão é contado separadamente",
      coveragePercent: "processos mapeados / total de processos publicados × 100",
    },
    total,
    critical: catalog.processes.filter((p) => p.criticality === "alta").length,
    mapped: mapped.size,
    coveragePercent: total ? Math.round((mapped.size / total) * 100) : 0,
    overdue: overdue.length,
    withoutReview: withoutReview.length,
    withoutOwner: catalog.processes.filter((p) => !p.owner?.name).length,
    confirmedRelationships: catalog.relationships.filter((r) => ids.has(r.from_process) && ids.has(r.to_process)).length,
    byDepartment,
  };
}

export function rankProcesses(question: string, catalog: AssistantCatalog, limit = 8): AssistantProcess[] {
  const terms = searchTerms(question);
  if (!terms.length) return [];
  const explicitName = question.match(/\bprocesso\s+(?:(?:de|da|do)\s+)?([^?!.]+)[?!.]*$/i);
  const nameTerms = explicitName ? searchTerms(explicitName[1]) : [];
  const extra = new Map<string, string[]>();
  const add = (id: string, value: unknown) => {
    if (typeof value === "string" && value) extra.set(id, [...(extra.get(id) || []), value]);
  };
  for (const n of catalog.nodes) {
    add(n.process_id, n.label); add(n.process_id, n.actor);
    add(n.process_id, n.attributes?.description); add(n.process_id, n.attributes?.systems?.toString());
  }
  for (const f of [...catalog.systems, ...catalog.pains, ...catalog.opportunities]) add(f.process_id, f.system_name || f.description || f.title);
  return catalog.processes.map((p) => {
    const title = searchTerms(`${p.name} ${p.code || ""}`).join(" ");
    const body = searchTerms([p.department, p.objective, p.scope, p.trigger_desc, p.inputs, p.outputs, ...(extra.get(p.id) || [])].filter(Boolean).join(" ")).join(" ");
    const score = nameTerms.length && !nameTerms.some((term) => title.includes(term)) ? 0 : terms.reduce((sum, term) => sum + (title.includes(term) ? 5 : 0) + (body.includes(term) ? 1 : 0), 0);
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name)).slice(0, limit).map((x) => x.p);
}

export function isOperationalQuestion(question: string): boolean {
  return /(tempo\s+m[eé]dio\s+real|tempo\s+real\s+de|nos\s+[uú]ltimos\s+\d+\s+dias|volume\s+real|quantas\s+execu[cç][oõ]es|taxa\s+de\s+retrabalho|lead\s*time|cycle\s*time)/i.test(question);
}

export function buildEvidence(question: string, catalog: AssistantCatalog) {
  let selected = rankProcesses(question, catalog);
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const exact = catalog.processes.filter((p) => normalize(question).includes(normalize(p.name))).sort((a, b) => b.name.length - a.name.length);
  if (exact.length) {
    const coded = exact.find((p) => p.code && normalize(question).includes(normalize(p.code)));
    selected = coded ? [coded] : exact.filter((p) => p.name === exact[0].name).slice(0, 8);
  }
  if (/^quais\b/i.test(question.trim()) && /cr[ií]tic/i.test(question)) {
    selected = catalog.processes.filter((p) => p.criticality === "alta").slice(0, 8);
  }
  if (/^quais\b/i.test(question.trim()) && /sem\s+(respons[aá]vel|dono)/i.test(question)) {
    selected = catalog.processes.filter((p) => !p.owner?.name).slice(0, 8);
  }
  if (/(relacion|depend[eê]n|conex|handoff)/i.test(question) && selected.length === 0) {
    const relatedIds = [...new Set(catalog.relationships.flatMap((r) => [r.from_process, r.to_process]))].slice(0, 8);
    selected = relatedIds.map((id) => catalog.processes.find((p) => p.id === id)).filter((p): p is AssistantProcess => !!p);
  }
  const ids = new Set(selected.map((p) => p.id));
  const all = new Map(catalog.processes.map((p) => [p.id, p]));
  const sources = selected.map((p, i) => ({ id: `P${i + 1}`, name: `${p.name}${p.code ? ` · ${p.code}` : ""}`, href: `/modelagem/${p.id}`, version: p.version }));
  const processes = selected.map((p, i) => {
    const nodes = catalog.nodes.filter((n) => n.process_id === p.id && n.kind !== "lane").slice(0, 60);
    const nodeIds = new Set(nodes.map((n) => n.node_id));
    const labels = new Map(nodes.map((n) => [n.node_id, n.label]));
    return {
      sourceId: `P${i + 1}`,
      process: p,
      activities: nodes.map((n) => ({ id: n.node_id, type: n.kind, label: n.label, actor: n.actor, activityType: n.activity_type, usesAI: n.uses_ai, attributes: n.attributes })),
      connections: catalog.edges.filter((e) => e.process_id === p.id && nodeIds.has(e.source_id) && nodeIds.has(e.target_id)).slice(0, 100).map((e) => ({ from: e.source_id, fromLabel: labels.get(e.source_id), to: e.target_id, toLabel: labels.get(e.target_id), condition: e.label })),
      systems: catalog.systems.filter((s) => s.process_id === p.id),
      pains: catalog.pains.filter((s) => s.process_id === p.id),
      opportunities: catalog.opportunities.filter((s) => s.process_id === p.id),
    };
  });
  const relationships = catalog.relationships.filter((r) => ids.has(r.from_process) || ids.has(r.to_process)).slice(0, 80).map((r) => ({
    from: all.get(r.from_process)?.name || r.from_process,
    to: all.get(r.to_process)?.name || r.to_process,
    kind: r.kind,
    artifact: r.label,
    status: "confirmada",
  }));
  return { kpis: catalogKpis(catalog), processes, relationships, sources };
}

export function answerCatalogQuestion(question: string, k: ReturnType<typeof catalogKpis>, catalog?: AssistantCatalog): string | null {
  const q = question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/^quais\b/.test(q)) return null;
  if (/tempo medio|volume real|execucoes|retrabalho/.test(q)) return null;
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const areaMention = q.match(/\b(?:area|departamento)\s+(?:de\s+)?([a-z0-9-]+)/)?.[1];
  const department = catalog && ([...new Set(catalog.processes.map((p) => p.department).filter((d): d is string => !!d))]
    .sort((a, b) => b.length - a.length).find((d) => q.includes(normalize(d))) || areaMention);
  const criticality = /\bcriticos?\b|criticidade alta/.test(q) ? "alta" : /criticidade media/.test(q) ? "media" : /criticidade baixa/.test(q) ? "baixa" : null;
  const status = /\bpublicad[oa]s?\b/.test(q) ? "publicado" : /\brascunhos?\b/.test(q) ? "rascunho" : /\bem revisao\b/.test(q) ? "em_revisao" : null;
  const filters = [department && `área ${department}`, criticality && `criticidade ${criticality}`, status && `status ${status}`].filter(Boolean);
  if (filters.length && !catalog) return null;
  const selected = filters.length ? catalog!.processes.filter((p) => (!department || normalize(p.department || "") === normalize(department)) && (!criticality || p.criticality === criticality) && (!status || p.status === status)) : null;
  const metrics = selected ? catalogKpis({ ...catalog!, processes: selected }, new Date(k.asOf)) : k;
  const context = filters.length ? ` com ${filters.join(" e ")}` : " no escopo consultado";
  if (/mapead|cobertura/.test(q)) return `Há ${metrics.mapped} processos mapeados de ${metrics.total}${context} (${metrics.coveragePercent}% de cobertura). Mapeado significa ter ao menos uma etapa no fluxo, sem contar raias. ${k.scope}.`;
  if (/critic/.test(q) && !criticality) return `Há ${metrics.critical} processos de criticidade alta entre ${metrics.total}${context}. ${k.scope}.`;
  if (/desatualiz|atrasad|vencid/.test(q)) return `Há ${metrics.overdue} processos com revisão vencida e ${metrics.withoutReview} sem data de revisão entre ${metrics.total}${context}. Critério: 365/548/730 dias para criticidade alta/média/baixa. ${k.scope}.`;
  if (/sem responsavel|sem dono/.test(q)) return `Há ${metrics.withoutOwner} processos sem responsável cadastrado entre ${metrics.total}${context}. ${k.scope}.`;
  if (/departamento|area/.test(q) && !department && /(quant|total|distribu|numero)/.test(q)) return `Processos por área: ${Object.entries(metrics.byDepartment).map(([name, count]) => `${name}: ${count}`).join("; ") || "nenhum"}. ${k.scope}.`;
  if (/(quant|total|numero)/.test(q) && /process/.test(q)) return `Há ${metrics.total} processos${context}. ${k.scope}.`;
  return null;
}

export function citationsAreValid(answer: string, sourceIds: string[], requireCitation: boolean): boolean {
  const cited = [...answer.matchAll(/\[P\d+\]/g)].map((m) => m[0].slice(1, -1));
  return (!requireCitation || cited.length > 0) && cited.every((id) => sourceIds.includes(id));
}

export function groundFollowUp(question: string, history: { role: string; content: string }[], catalog: AssistantCatalog): string {
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const current = normalize(question);
  if (catalog.processes.some((p) => current.includes(normalize(p.name))) || /\b(?:quantos?|quantas?|quais processos|total|cobertura|kpis?)\b/.test(current)) return question;
  for (const prior of [...history].reverse()) {
    if (prior.role !== "user") continue;
    const named = catalog.processes.filter((p) => normalize(prior.content).includes(normalize(p.name))).sort((a, b) => b.name.length - a.name.length);
    if (!named.length) continue;
    const coded = named.find((p) => p.code && normalize(prior.content).includes(normalize(p.code)));
    const chosen = coded || named[0];
    if (named.filter((p) => p.name === chosen.name).length > 1 && !coded) return question;
    return `${question} (referente ao processo ${chosen.name}${chosen.code ? ` ${chosen.code}` : ""})`;
  }
  return question;
}

export function answerStructuredList(question: string, catalog: AssistantCatalog): { answer: string; sources: { id: string; name: string; href: string; version: number }[] } | null {
  const q = question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const byId = new Map(catalog.processes.map((p) => [p.id, p]));
  const sourceFor = (p: AssistantProcess, id: string) => ({ id, name: p.name, href: `/modelagem/${p.id}`, version: p.version });
  const named = catalog.processes.filter((p) => q.includes(p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
  if (named.length > 1) {
    const longestName = [...named].sort((a, b) => b.name.length - a.name.length)[0].name;
    const sameName = named.filter((p) => p.name === longestName);
    if (sameName.length > 1 && !sameName.some((p) => p.code && q.includes(p.code.toLowerCase()))) {
      const sources = sameName.map((p, i) => ({ ...sourceFor(p, `P${i + 1}`), name: `${p.name} · ${p.code || p.id.slice(0, 8)}` }));
      const lines = sameName.map((p, i) => `${p.code || p.id.slice(0, 8)} [P${i + 1}] — versão ${p.version}, ${p.status || "status não informado"}, ${catalog.nodes.filter((n) => n.process_id === p.id && n.kind !== "lane").length} elementos no fluxo`);
      return { answer: `Encontrei ${sameName.length} registros com o nome ${sameName[0].name}. Para não misturar fluxos diferentes, indique o código do processo desejado:\n${lines.join("\n")}`, sources };
    }
  }
  if (/\b(dores?|pain.points?)\b/.test(q) && /(registrad|cadastrad|documentad|quais|qual)/.test(q)) {
    const processMention = question.match(/\bprocesso\s+(?:(?:de|da|do)\s+)?([^?!.]+)[?!.]*$/i);
    const selected = processMention ? buildEvidence(question, catalog).processes.map((entry) => entry.process).slice(0, 1) : [];
    if (processMention && !selected.length) return { answer: "Não encontrei esse processo no escopo consultado.", sources: [] };
    const selectedIds = new Set(selected.map((p) => p.id));
    const rows = catalog.pains.filter((p) => !processMention || selectedIds.has(p.process_id));
    const participants = [...new Set(rows.map((p) => p.process_id))].map((id) => byId.get(id)).filter((p): p is AssistantProcess => !!p);
    if (processMention && selected[0] && !participants.some((p) => p.id === selected[0].id)) participants.push(selected[0]);
    const sources = participants.slice(0, 40).map((p, i) => sourceFor(p, `P${i + 1}`));
    const sourceIds = new Map(participants.map((p, i) => [p.id, `P${i + 1}`]));
    const shown = rows.slice(0, 40);
    const lines = shown.map((r) => `${byId.get(r.process_id)?.name || "Processo"} [${sourceIds.get(r.process_id)}]: ${r.description}`);
    const context = processMention && selected[0] ? ` no processo ${selected[0].name}` : " no escopo consultado";
    return { answer: rows.length ? `${rows.length} dores formalmente registradas${context}. ${shown.length < rows.length ? `Mostrando as primeiras ${shown.length}.` : ""}\n${lines.join("\n")}` : `Nenhuma dor está formalmente registrada${context} no campo próprio. Isso não prova ausência de problemas; apenas que não há registros nesse campo.`, sources };
  }
  if (/^quais\b/.test(q) && /(relacion|conex|handoff)/.test(q)) {
    const rows = catalog.relationships.filter((r) => byId.has(r.from_process) && byId.has(r.to_process));
    const shown = rows.slice(0, 40);
    const participants = [...new Set(shown.flatMap((r) => [r.from_process, r.to_process]))];
    const ids = new Map(participants.map((id, i) => [id, `P${i + 1}`]));
    const sources = participants.map((id) => sourceFor(byId.get(id)!, ids.get(id)!));
    const lines = shown.map((r) => `${byId.get(r.from_process)!.name} [${ids.get(r.from_process)}] → ${byId.get(r.to_process)!.name} [${ids.get(r.to_process)}]${r.label ? ` — ${r.label}` : ""}`);
    return { answer: rows.length ? `${rows.length} relações confirmadas no escopo. ${shown.length < rows.length ? `Mostrando as primeiras ${shown.length}.` : ""}\n${lines.join("\n")}` : "Não há relações confirmadas no escopo consultado.", sources };
  }
  if (/^quais\b/.test(q) && /process/.test(q) && /(usa|usam|utiliza|utilizam|dependem|sistema)/.test(q)) {
    const namedSystems = [...new Set([
      ...catalog.systems.map((s) => s.system_name).filter((s): s is string => !!s),
      ...catalog.nodes.flatMap((n) => Array.isArray(n.attributes?.systems) ? n.attributes.systems.filter((s): s is string => typeof s === "string") : []),
    ])];
    const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const knownName = namedSystems.filter((name) => normalized(name).length >= 3 && q.includes(normalized(name))).sort((a, b) => b.length - a.length)[0];
    const requestedName = q.match(/\b(?:usam|usa|utilizam|utiliza)\s+([a-z0-9][a-z0-9 /.+-]*)/)?.[1]?.trim();
    const matchedName = knownName || requestedName;
    if (!matchedName) return null;
    const displayName = knownName || (matchedName.length <= 4 ? matchedName.toUpperCase() : matchedName);
    const target = normalized(matchedName);
    const matchingIds = new Set([
      ...catalog.systems.filter((s) => s.system_name && normalized(s.system_name).includes(target)).map((s) => s.process_id),
      ...catalog.nodes.filter((n) => Array.isArray(n.attributes?.systems) && n.attributes.systems.some((s) => typeof s === "string" && normalized(s).includes(target))).map((n) => n.process_id),
    ]);
    const matches = catalog.processes.filter((p) => matchingIds.has(p.id));
    const shown = matches.slice(0, 40);
    const sources = shown.map((p, i) => sourceFor(p, `P${i + 1}`));
    const lines = shown.map((p, i) => `${p.name} [P${i + 1}] (${p.status || "status não informado"})`);
    return { answer: matches.length ? `${matches.length} processos registram uso de ${displayName} no escopo. ${shown.length < matches.length ? `Mostrando os primeiros ${shown.length}.` : ""}\n${lines.join("\n")}` : `Nenhum processo registra ${displayName} como sistema no escopo consultado.`, sources };
  }
  if (/^quais\b/.test(q) && /process/.test(q) && /(critico|sem responsavel|sem dono)/.test(q)) {
    const critical = /critico/.test(q);
    const matches = catalog.processes.filter((p) => critical ? p.criticality === "alta" : !p.owner?.name);
    const shown = matches.slice(0, 40);
    const sources = shown.map((p, i) => sourceFor(p, `P${i + 1}`));
    return { answer: `${matches.length} processos ${critical ? "críticos" : "sem responsável"} no escopo. ${shown.length < matches.length ? `Mostrando os primeiros ${shown.length}.` : ""}${shown.length ? `\n${shown.map((p, i) => `${p.name} [P${i + 1}] (${p.status || "status não informado"})`).join("\n")}` : ""}`, sources };
  }
  return null;
}
