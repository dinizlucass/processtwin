import type { Node, Edge } from "@xyflow/react";

/** Breadth-first placement: cycles remain valid and each node is visited once.
 * With lanes, keep vertical responsibility bands and use distinct columns. */
export function arrangeFlow(nodes: Node[], edges: Edge[]): Node[] {
  const content = nodes.filter((n) => n.type !== "lane");
  const ids = new Set(content.map((n) => n.id));
  const outgoing = new Map<string, string[]>();
  const incoming = new Set<string>();
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    incoming.add(edge.target);
  }
  const queue: [string, number][] = content.filter((n) => !incoming.has(n.id) || n.data.kind === "start").map((n) => [n.id, 0]);
  const ranks = new Map<string, number>();
  const visit = () => {
    for (let i = 0; i < queue.length; i++) {
      const [id, rank] = queue[i];
      if (ranks.has(id)) continue;
      ranks.set(id, rank);
      for (const target of outgoing.get(id) ?? []) if (!ranks.has(target)) queue.push([target, rank + 1]);
    }
    queue.length = 0;
  };
  visit();
  for (const node of content) if (!ranks.has(node.id)) { queue.push([node.id, 0]); visit(); }
  const rows = new Map<number, number>();
  const hasLanes = nodes.some((n) => n.type === "lane");
  const ordered = [...content].sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!);
  const columns = new Map(ordered.map((n, i) => [n.id, i]));
  return nodes.map((n) => {
    if (n.type === "lane") return { ...n, width: Math.max(960, content.length * 260 + 280), data: { ...n.data, width: Math.max(960, content.length * 260 + 280) } };
    const rank = ranks.get(n.id) ?? 0;
    const row = rows.get(rank) ?? 0;
    rows.set(rank, row + 1);
    return { ...n, position: { x: 180 + (hasLanes ? columns.get(n.id)! : rank) * 260, y: hasLanes ? n.position.y : 140 + row * 140 } };
  });
}

/** Structural BPMN checks; business correctness still needs the process owner. */
export function validateFlow(nodes: Node[], edges: Edge[]): string[] {
  const content = nodes.filter((n) => !["lane", "annotation", "data"].includes(n.type ?? String(n.data.kind)));
  const issues: string[] = [];
  const allIds = new Set(nodes.map((n) => n.id));
  if (allIds.size !== nodes.length) issues.push("Há elementos com identificadores repetidos.");
  const starts = content.filter((n) => n.data.kind === "start");
  const ends = content.filter((n) => n.data.kind === "end");
  if (!starts.length) issues.push("Adicione um evento de início.");
  if (!ends.length) issues.push("Adicione um evento de fim.");
  const contentIds = new Set(content.map((n) => n.id));
  const outgoing = new Map<string, Edge[]>();
  const incoming = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!allIds.has(e.source) || !allIds.has(e.target)) issues.push(`Conexão ${e.id ?? ""}: referencia um elemento inexistente.`);
    if (e.source === e.target) issues.push(`Conexão ${e.id ?? ""}: um elemento não pode conectar a si mesmo.`);
    if (!contentIds.has(e.source) || !contentIds.has(e.target)) continue;
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e]);
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), e]);
  }
  const traverse = (seeds: Node[], adjacency: Map<string, Edge[]>, direction: "source" | "target") => {
    const reached = new Set<string>();
    const queue = seeds.map((n) => n.id);
    for (let i = 0; i < queue.length; i++) {
      if (reached.has(queue[i])) continue;
      reached.add(queue[i]);
      for (const edge of adjacency.get(queue[i]) ?? []) queue.push(edge[direction]);
    }
    return reached;
  };
  const reachable = traverse(starts, outgoing, "target");
  const terminates = traverse(ends, incoming, "source");
  for (const node of content) {
    const label = String(node.data.label || node.id);
    const out = outgoing.get(node.id) ?? [];
    const into = incoming.get(node.id) ?? [];
    if (starts.length && !reachable.has(node.id)) issues.push(`${label}: não é alcançável a partir do início.`);
    if (ends.length && !terminates.has(node.id)) issues.push(`${label}: não há caminho até um evento de fim (verifique ciclos e saídas).`);
    if (node.data.kind === "start" && into.length) issues.push(`${label}: um início não deve receber fluxo de sequência.`);
    if (node.data.kind === "end" && out.length) issues.push(`${label}: um fim não deve emitir fluxo de sequência.`);
    if (node.data.kind !== "end" && !out.length) issues.push(`${label}: falta uma conexão de saída.`);
    const gateway = ["decision", "gateway_inclusive", "gateway_parallel"].includes(String(node.data.kind));
    if (gateway && out.length < 2 && into.length < 2) issues.push(`${label}: defina ao menos dois caminhos de decisão ou uma convergência de entradas.`);
    if (["decision", "gateway_inclusive"].includes(String(node.data.kind)) && out.length > 1) {
      const labels = out.map((e) => typeof e.label === "string" ? e.label.trim().toLowerCase() : "");
      if (labels.some((label) => !label)) issues.push(`${label}: identifique as condições de saída.`);
      if (new Set(labels.filter(Boolean)).size < labels.filter(Boolean).length) issues.push(`${label}: há condições de saída repetidas.`);
    }
  }
  return issues;
}
