import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ExtractedFacts } from "@/lib/phases";

export interface ConversationMessage {
  role: "ai" | "user";
  text: string;
}

export interface ConversationListItem {
  id: string;
  title: string;
  preview: string;
  status: string;
  messageCount: number;
  userMessageCount: number;
  updatedAt: string;
  createdAt: string;
  processId: string | null;
  processName: string | null;
  processCode: string | null;
}

export interface ConversationDetail extends ConversationListItem {
  messages: ConversationMessage[];
  extractedFields: ExtractedFacts;
}

interface Row {
  id: string;
  messages: ConversationMessage[] | null;
  extracted_fields: ExtractedFacts | null;
  status: string;
  created_at: string;
  updated_at: string;
  process_id: string | null;
  process: { name: string; code: string } | null;
}

const SELECT_COLS = "id,messages,extracted_fields,status,created_at,updated_at,process_id,process:process_id(name,code)";

const OPENING_PREFIX = "Vamos mapear este processo juntos";

function normalizeMessages(raw: ConversationMessage[] | null): ConversationMessage[] {
  return (raw ?? []).filter((m) => m && typeof m.text === "string" && (m.role === "ai" || m.role === "user"));
}

const cap = (s: string) => (s.length > 60 ? `${s.slice(0, 60)}…` : s);

// aberturas conversacionais que NÃO são nome de processo
const FILLER_START =
  /^(sim|n[aã]o|ok|talvez|acho|isso|oi|ol[aá]|bom|boa|quero|preciso|vamos|gostaria|pode|comigo|ent[aã]o|aqui|esse|essa|este|esta|meu|minha|obrigad)/i;

/** Uma resposta serve de título quando parece um NOME de processo, não uma
 * resposta solta do meio da entrevista (ex.: "Não", "20 casos", "comigo"). */
function looksLikeName(s: string): boolean {
  const t = s.trim();
  if (t.length < 4 || t.length > 70) return false;
  if (/^\d/.test(t)) return false; // começa com número (métrica, volume…)
  if (FILLER_START.test(t)) return false;
  const words = t.split(/\s+/);
  // fragmento de uma palavra em minúscula (ex.: "comigo", "reembolso") é fraco:
  // só aceita palavra única se vier capitalizada (parece um nome próprio/processo)
  if (words.length === 1 && !/^[A-ZÀ-Ý]/.test(t)) return false;
  // precisa ter ao menos uma letra e não ser só pontuação
  if (!/[A-Za-zÀ-ý]/.test(t)) return false;
  return true;
}

const stripNameLabel = (s: string) =>
  s
    .replace(/^nome[_ ]?(?:do[_ ]?)?processo\s*[:\-]\s*/i, "")
    .replace(/^nome\s*[:\-]\s*/i, "")
    .replace(/^processo\s*[:\-]\s*/i, "")
    .trim();

function deriveTitle(row: Row, messages: ConversationMessage[]): string {
  if (row.process?.name) return row.process.name;

  // o nome do processo costuma estar rotulado na fase de Visão Geral extraída
  // (ex.: "nome_processo: Ativação e Faturamento…") — é a fonte mais confiável.
  const vg = row.extracted_fields?.visao_geral?.trim();
  if (vg) {
    const labeled = vg.match(/nome[_ ]?(?:do[_ ]?)?processo\s*[:\-]\s*([^.,;\n]+)/i) ?? vg.match(/\bnome\s*[:\-]\s*([^.,;\n]+)/i);
    if (labeled?.[1]?.trim()) return cap(labeled[1].trim());
  }

  // no "do zero" a 1ª resposta costuma ser "Nome do processo — objetivo"
  const firstUser = messages.find((m) => m.role === "user")?.text?.trim();
  if (firstUser) {
    const head = firstUser.split(/[—–-]/)[0].trim() || firstUser;
    if (looksLikeName(head)) return cap(head);
  }

  // senão, a primeira oração da Visão Geral (sem o rótulo)
  if (vg) {
    const clause = stripNameLabel(vg.split(/[.,;\n]/)[0].trim());
    if (clause) return cap(clause);
  }

  // último recurso: rotula pela data, para não virar "Conversa sem título"
  const when = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(row.created_at));
  return `Entrevista · ${when}`;
}

function derivePreview(messages: ConversationMessage[]): string {
  const last = [...messages].reverse().find((m) => m.text?.trim() && !m.text.startsWith(OPENING_PREFIX));
  const text = last?.text?.trim() ?? "";
  return text.length > 130 ? `${text.slice(0, 130)}…` : text;
}

function toItem(row: Row): ConversationListItem {
  const messages = normalizeMessages(row.messages);
  return {
    id: row.id,
    title: deriveTitle(row, messages),
    preview: derivePreview(messages),
    status: row.status,
    messageCount: messages.length,
    userMessageCount: messages.filter((m) => m.role === "user").length,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    processId: row.process_id,
    processName: row.process?.name ?? null,
    processCode: row.process?.code ?? null,
  };
}

export async function listConversations(): Promise<ConversationListItem[]> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("ai_conversation")
    .select(SELECT_COLS)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar conversas: ${error.message}`);

  return (data as unknown as Row[])
    // Uploads já contêm trabalho recuperável mesmo antes da primeira resposta.
    .filter((row) => !!row.extracted_fields?.sourceTranscript?.trim() || normalizeMessages(row.messages).some((message) => message.role === "user"))
    .map(toItem);
}

/** Conversas que ainda dá para retomar a entrevista (não concluídas), mais
 * recentes primeiro. Usada para oferecer "continuar de onde parou". */
export async function listResumableConversations(limit = 6): Promise<ConversationListItem[]> {
  return (await listConversations()).filter((c) => c.status !== "concluida").slice(0, limit);
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  const supabase = supabaseAdmin();
  const read = () => supabase
    .from("ai_conversation")
    .select(SELECT_COLS)
    .eq("id", id)
    .maybeSingle();
  let result = await read();
  // A read is safe to repeat after a transport/server failure; never retry mutations here.
  if (result.error && (result.status === 0 || result.status >= 500)) result = await read();
  const { data, error } = result;
  if (error) throw new Error("Falha ao consultar a conversa.");
  if (!data) return null;

  const row = data as unknown as Row;
  return { ...toItem(row), messages: normalizeMessages(row.messages), extractedFields: row.extracted_fields ?? {} };
}
