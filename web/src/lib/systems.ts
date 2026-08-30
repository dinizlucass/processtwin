// Registro canônico de sistemas (client-safe, puro) — CON-01.
// Nomes de sistema entram como texto livre na entrevista ("SAP Concur", "ERP SAP",
// "SAP FI"…). Sem normalização, cada variante vira um nó diferente no grafo e a
// análise de impacto (quem depende de qual sistema) fica errada. Aqui casamos as
// variantes por aliases + similaridade para um nome canônico único.

export interface CanonicalSystem {
  name: string; // rótulo canônico exibido
  aliases: string[]; // formas alternativas (serão normalizadas na comparação)
}

// Base semente dos sistemas corporativos mais comuns no domínio (B3/back-office).
// Não precisa ser exaustiva: o que não casar aqui vira seu próprio canônico.
export const CANONICAL_SYSTEMS: CanonicalSystem[] = [
  { name: "SAP", aliases: ["sap", "erp sap", "sap erp", "sap ecc", "sap fi", "sap co", "sap mm", "sap sd", "sap r3", "sap r/3", "sap s4", "sap s/4", "sap s4hana", "sap s/4hana", "sap hana"] },
  { name: "SAP Concur", aliases: ["concur", "sap concur"] },
  { name: "TOTVS", aliases: ["totvs", "totvs rh", "totvs protheus", "protheus", "totvs rm", "rm totvs"] },
  { name: "Oracle", aliases: ["oracle", "oracle erp", "oracle ebs", "oracle financials", "oracle fusion"] },
  { name: "Salesforce", aliases: ["salesforce", "sfdc", "salesforce crm"] },
  { name: "Workday", aliases: ["workday"] },
  { name: "ServiceNow", aliases: ["servicenow", "service now", "snow"] },
  { name: "Gupy", aliases: ["gupy"] },
  { name: "DocuSign", aliases: ["docusign", "docu sign"] },
  { name: "Microsoft Excel", aliases: ["excel", "ms excel", "planilha excel", "planilhas excel"] },
  { name: "Microsoft Outlook", aliases: ["outlook", "ms outlook", "e-mail outlook"] },
  { name: "Microsoft SharePoint", aliases: ["sharepoint", "share point"] },
  { name: "Microsoft Power BI", aliases: ["power bi", "powerbi", "ms power bi"] },
  { name: "Microsoft Teams", aliases: ["teams", "ms teams"] },
  { name: "Google Workspace", aliases: ["google workspace", "gsuite", "g suite", "google sheets", "planilhas google"] },
  { name: "Jira", aliases: ["jira", "jira software"] },
  { name: "Confluence", aliases: ["confluence"] },
  { name: "Slack", aliases: ["slack"] },
  { name: "Zendesk", aliases: ["zendesk"] },
  { name: "Bloomberg", aliases: ["bloomberg", "bloomberg terminal"] },
];

// palavras de ruído que não ajudam a identificar o sistema
const NOISE = new Set(["sistema", "sistemas", "plataforma", "software", "ferramenta", "app", "aplicacao", "aplicativo", "modulo", "do", "da", "de", "the"]);

/** Chave normalizada para comparação: minúsculas, sem acento/pontuação, sem ruído. */
export function normalizeSystemKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
    .join(" ");
}

// índice alias-normalizado → canônico (montado uma vez)
const ALIAS_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const sys of CANONICAL_SYSTEMS) {
    m.set(normalizeSystemKey(sys.name), sys.name);
    for (const a of sys.aliases) m.set(normalizeSystemKey(a), sys.name);
  }
  return m;
})();

// tokens do primeiro termo de cada canônico, p/ casar "sap fi" → SAP por prefixo forte
const HEAD_TOKEN_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const sys of CANONICAL_SYSTEMS) {
    const head = normalizeSystemKey(sys.name).split(" ")[0];
    // só registra heads distintivos (evita "microsoft"/"google" que são genéricos)
    if (head && head.length >= 3 && !["microsoft", "google", "oracle"].includes(head)) {
      if (!m.has(head)) m.set(head, sys.name);
    }
  }
  return m;
})();

function titleCase(s: string): string {
  return s.replace(/\S+/g, (w) => (w.length <= 2 ? w : w[0].toUpperCase() + w.slice(1)));
}

/**
 * Nome canônico de um sistema a partir de texto livre.
 * 1) alias exato → canônico; 2) head-token forte (ex.: "sap fi" → SAP);
 * 3) senão, devolve o próprio nome limpo (trim + Title Case), preservando a grafia.
 */
export function canonicalSystemName(raw: string): string {
  const original = raw.trim();
  if (!original) return "";
  const key = normalizeSystemKey(original);
  if (!key) return original;

  const exact = ALIAS_INDEX.get(key);
  if (exact) return exact;

  // head token distintivo (o 1º termo casa com um canônico conhecido)
  const head = key.split(" ")[0];
  const byHead = HEAD_TOKEN_INDEX.get(head);
  if (byHead) return byHead;

  // grafia original quando já vem "bonita"; senão Title Case do texto limpo
  return /[A-Z]/.test(original) ? original : titleCase(key);
}

/** Similaridade 0..1 por conjunto de tokens (Jaccard) — leve, sem libs. */
function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Sugere um nome já existente ("Você quis dizer …?") para uma entrada nova,
 * quando forem suficientemente parecidos mas não idênticos. Retorna null se não
 * houver candidato bom. Usa canônico + similaridade de tokens/substring.
 */
export function suggestCanonical(raw: string, existing: string[]): string | null {
  const canon = canonicalSystemName(raw);
  const key = normalizeSystemKey(raw);
  if (!key) return null;
  let best: { name: string; score: number } | null = null;
  for (const e of existing) {
    if (!e) continue;
    if (canonicalSystemName(e) === canon && normalizeSystemKey(e) !== key) return e; // mesmo canônico, grafia diferente
    const ek = normalizeSystemKey(e);
    if (ek === key) return null; // já existe idêntico → nada a sugerir
    let score = tokenSimilarity(key, ek);
    if (ek.includes(key) || key.includes(ek)) score = Math.max(score, 0.7);
    if (!best || score > best.score) best = { name: e, score };
  }
  return best && best.score >= 0.6 ? best.name : null;
}
