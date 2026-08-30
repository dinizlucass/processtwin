// Handoffs entre processos (CON-03) — modelo puro, client-safe.
// Não existe relação processo→processo explícita no schema base; inferimos
// candidatos por artefatos compartilhados: a SAÍDA de um processo que casa com
// o GATILHO/nome de outro sugere um hand-off (saída de A alimenta B). Relações
// confirmadas (tabela process_relationship) chegam com confirmed=true.

export interface Handoff {
  source: string; // process id (origem)
  target: string; // process id (destino)
  label?: string;
  confirmed: boolean; // true = relação salva pelo usuário; false = candidata inferida
  relationshipId?: string; // id na tabela, quando confirmada
}

export interface ProcessIO {
  id: string;
  name: string;
  trigger: string | null;
  outputs: string | null;
  systems: string[];
}

// termos genéricos que não caracterizam um artefato específico
const STOP = new Set([
  "processo", "cliente", "clientes", "dados", "informacao", "informacoes", "sistema", "sistemas",
  "documento", "documentos", "solicitacao", "solicitacoes", "pedido", "aprovacao", "envio", "recebimento",
  "para", "com", "dos", "das", "por", "que", "uma", "novo", "nova", "gera", "geracao", "registro",
  "area", "equipe", "time", "gestor", "responsavel", "final", "inicio",
]);

function tokens(s: string | null): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

function overlap(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const t of a) if (b.has(t)) out.push(t);
  return out;
}

/**
 * Infere hand-offs candidatos: para cada par (A,B) distinto, se a saída de A
 * compartilhar um termo significativo com o gatilho ou o nome de B, propõe
 * A→B. Conservador (exige termo forte) e limitado, para não virar "hairball".
 */
export function inferHandoffCandidates(processes: ProcessIO[], max = 40): Handoff[] {
  const enriched = processes.map((p) => ({
    p,
    out: tokens(p.outputs),
    inTrigger: new Set<string>([...tokens(p.trigger), ...tokens(p.name)]),
  }));

  const candidates: { h: Handoff; score: number }[] = [];
  for (const a of enriched) {
    if (!a.out.size) continue;
    for (const b of enriched) {
      if (a.p.id === b.p.id) continue;
      const shared = overlap(a.out, b.inTrigger);
      if (shared.length === 0) continue;
      candidates.push({
        h: { source: a.p.id, target: b.p.id, label: shared[0], confirmed: false },
        score: shared.length,
      });
    }
  }

  candidates.sort((x, y) => y.score - x.score);
  return candidates.slice(0, max).map((c) => c.h);
}
