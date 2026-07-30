// Fonte única de verdade das 7 fases do mapeamento.
// Usada pela entrevista (copilot), pela extração de transcrição e pelo guia
// de fases no front — para que as três partes falem a MESMA taxonomia.

export type PhaseKey =
  | "visao_geral"
  | "gatilhos"
  | "fluxo"
  | "sistemas"
  | "regras"
  | "metricas"
  | "dores";

export interface PhaseDef {
  n: number; // 1..7, ordem canônica
  key: PhaseKey; // chave de máquina (usada no JSON de extração e no estado)
  label: string; // rótulo exibido ao usuário
  goal: string; // o que precisa ser capturado (injetado nos prompts)
}

export const PHASES: PhaseDef[] = [
  {
    n: 1,
    key: "visao_geral",
    label: "Visão Geral",
    goal: "Nome do processo, Process Owner (dono) e o objetivo — por que o processo precisa existir e se, redesenhado do zero hoje, ainda faria sentido.",
  },
  {
    n: 2,
    key: "gatilhos",
    label: "Gatilhos",
    goal: "O gatilho exato que inicia o processo, as entradas e a entrega final (outputs) e quem consome o resultado.",
  },
  {
    n: 3,
    key: "fluxo",
    label: "Fluxo",
    goal: "As etapas do início ao fim (verbo + objeto, ex.: 'Validar cadastro') e o executor (raia) de cada uma.",
  },
  {
    n: 4,
    key: "sistemas",
    label: "Ecossistema e Sistemas",
    goal: "Sistemas, ERPs e planilhas usados em cada etapa e se a passagem de dados entre eles é sistêmica (integrada) ou manual.",
  },
  {
    n: 5,
    key: "regras",
    label: "Regras de Negócio e Exceções",
    goal: "Critérios de aprovação/reprovação, pontos de decisão, onde há interpretação manual (subjetividade) e as principais exceções.",
  },
  {
    n: 6,
    key: "metricas",
    label: "Métricas",
    goal: "Frequência, volume médio, tempo por etapa, filas/backlog, SLA e controles preventivos/corretivos.",
  },
  {
    n: 7,
    key: "dores",
    label: "Dores e Oportunidades",
    goal: "Onde ocorrem erros/atrasos/retrabalho, os principais riscos operacionais e oportunidades de automação.",
  },
];

export const PHASE_LABELS: string[] = PHASES.map((p) => p.label);
export const PHASE_KEYS: PhaseKey[] = PHASES.map((p) => p.key);
export const PHASE_COUNT = PHASES.length;

/** O que a IA extrai de uma transcrição, um resumo textual por fase. */
export type ExtractedFacts = Partial<Record<PhaseKey, string | null>>;

/** Roteiro numerado das fases, para injetar nos system prompts da entrevista. */
export function renderRoteiro(): string {
  return PHASES.map((p) => `${p.n}. ${p.label}: ${p.goal}`).join("\n");
}

/** Descreve as chaves canônicas do JSON que a extração de transcrição deve devolver. */
export function renderPhaseKeysForJson(): string {
  return PHASES.map((p) => `${p.n}. "${p.key}" (${p.label}): ${p.goal}`).join("\n");
}

/** Mantém só as chaves canônicas e normaliza vazios em null. */
export function normalizeFacts(raw: unknown): ExtractedFacts {
  const facts: ExtractedFacts = {};
  if (!raw || typeof raw !== "object") return facts;
  const src = raw as Record<string, unknown>;
  for (const key of PHASE_KEYS) {
    const v = src[key];
    facts[key] = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  return facts;
}

/** true se pelo menos uma fase foi preenchida pela transcrição. */
export function hasAnyFact(facts?: ExtractedFacts | null): boolean {
  if (!facts) return false;
  return PHASE_KEYS.some((k) => typeof facts[k] === "string" && (facts[k] as string).trim());
}

/**
 * Bloco de contexto com o que já foi extraído de uma transcrição. Injetado na
 * entrevista e na geração para o modelo NÃO repetir perguntas e ancorar o
 * mapeamento nos fatos já conhecidos. Retorna "" quando não há fatos.
 */
export function buildKnownFactsBlock(facts?: ExtractedFacts | null): string {
  if (!hasAnyFact(facts)) return "";
  const lines = PHASES.map((p) => {
    const v = facts?.[p.key];
    const filled = typeof v === "string" && v.trim();
    return `- ${p.label}: ${filled ? v.trim() : "(não informado — precisa ser levantado)"}`;
  });
  return `CONTEXTO JÁ EXTRAÍDO DE UMA TRANSCRIÇÃO DE REUNIÃO (fonte de verdade — NÃO pergunte o que já está preenchido; use para ancorar suas perguntas e apenas confirme pontos ambíguos):
${lines.join("\n")}

Priorize levantar as fases marcadas como "(não informado)", seguindo a ordem do roteiro.`;
}

// ---------- Mapa de cobertura (dirige as perguntas e a prontidão) ----------

export type CoverageStatus = "coberto" | "parcial" | "vazio";

export interface PhaseCoverage {
  key: PhaseKey;
  status: CoverageStatus;
  resumo?: string; // o que já se sabe dessa fase
  faltando?: string; // o que ainda precisa ser levantado
}

export type Coverage = PhaseCoverage[];

// Fases mínimas para um primeiro pré-mapeamento coerente (nome/dono, gatilho,
// etapas com executores e sistemas). As demais enriquecem, mas não bloqueiam.
const CORE_PHASES: PhaseKey[] = ["visao_geral", "gatilhos", "fluxo", "sistemas"];

const VALID_STATUS: CoverageStatus[] = ["coberto", "parcial", "vazio"];

/** Uma entrada por fase, na ordem canônica, descartando o que vier fora do esquema. */
export function normalizeCoverage(raw: unknown): Coverage {
  const byKey = new Map<PhaseKey, PhaseCoverage>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const key = o.key as PhaseKey;
      if (!PHASE_KEYS.includes(key) || byKey.has(key)) continue;
      byKey.set(key, {
        key,
        status: VALID_STATUS.includes(o.status as CoverageStatus) ? (o.status as CoverageStatus) : "vazio",
        resumo: typeof o.resumo === "string" && o.resumo.trim() ? o.resumo.trim() : undefined,
        faltando: typeof o.faltando === "string" && o.faltando.trim() ? o.faltando.trim() : undefined,
      });
    }
  }
  return PHASES.map((p) => byKey.get(p.key) ?? { key: p.key, status: "vazio" as CoverageStatus });
}

const STATUS_RANK: Record<CoverageStatus, number> = { vazio: 0, parcial: 1, coberto: 2 };

/**
 * Funde a cobertura anterior com a nova SEM regredir: mantém o maior status já
 * conquistado por fase (o que a transcrição/entrevista alcançou não volta
 * atrás) e usa o resumo/faltando mais recente. Garante que a % só aumente.
 */
export function mergeCoverage(prev?: Coverage | null, next?: Coverage | null): Coverage {
  const prevByKey = new Map((prev ?? []).map((c) => [c.key, c]));
  const nextByKey = new Map((next ?? []).map((c) => [c.key, c]));
  return PHASES.map((p) => {
    const a = prevByKey.get(p.key);
    const b = nextByKey.get(p.key);
    if (!a && !b) return { key: p.key, status: "vazio" as CoverageStatus };
    if (!a) return b!;
    if (!b) return a;
    const status = STATUS_RANK[b.status] >= STATUS_RANK[a.status] ? b.status : a.status;
    return {
      key: p.key,
      status,
      resumo: b.resumo ?? a.resumo,
      faltando: status === "coberto" ? undefined : b.faltando ?? a.faltando,
    };
  });
}

/**
 * Cobertura inicial derivada dos fatos da transcrição (antes do 1º turno).
 * O que a transcrição levantou entra como "parcial" (amarelo): há informação,
 * mas nada foi confirmado/finalizado na conversa — vira "coberto" só depois.
 */
export function coverageFromFacts(facts?: ExtractedFacts | null): Coverage {
  return PHASES.map((p) => {
    const v = facts?.[p.key];
    const filled = typeof v === "string" && v.trim();
    return {
      key: p.key,
      status: (filled ? "parcial" : "vazio") as CoverageStatus,
      resumo: filled ? (v as string).trim() : undefined,
    };
  });
}

/** Pronto para gerar quando as fases essenciais estão ao menos parciais. */
export function coverageReady(coverage?: Coverage | null): boolean {
  if (!coverage || coverage.length === 0) return false;
  const byKey = new Map(coverage.map((c) => [c.key, c.status]));
  return CORE_PHASES.every((k) => {
    const s = byKey.get(k);
    return s === "coberto" || s === "parcial";
  });
}

/** Progresso ponderado: coberto = 1, parcial = 0,5. Retorna 0..100. */
export function coverageProgress(coverage?: Coverage | null): number {
  if (!coverage || coverage.length === 0) return 0;
  const byKey = new Map(coverage.map((c) => [c.key, c.status]));
  let score = 0;
  for (const p of PHASES) {
    const s = byKey.get(p.key);
    if (s === "coberto") score += 1;
    else if (s === "parcial") score += 0.5;
  }
  return Math.round((score / PHASE_COUNT) * 100);
}

/**
 * Síntese por fase consolidada da conversa, para ANCORAR a geração do
 * pré-mapeamento (complementa os fatos crus da transcrição). "" se vazia.
 */
export function buildCoverageDigest(coverage?: Coverage | null): string {
  if (!coverage || coverage.length === 0) return "";
  const labelOf = new Map(PHASES.map((p) => [p.key, p.label]));
  const lines = coverage
    .filter((c) => c.resumo && c.resumo.trim())
    .map((c) => `- ${labelOf.get(c.key) ?? c.key}: ${c.resumo!.trim()}`);
  if (lines.length === 0) return "";
  return `SÍNTESE POR FASE (consolidada da conversa até aqui — use como guia estruturado, complementando os fatos da transcrição):
${lines.join("\n")}`;
}
