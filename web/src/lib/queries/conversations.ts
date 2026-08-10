import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

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
  extractedFields: Record<string, string>;
}

interface Row {
  id: string;
  messages: ConversationMessage[] | null;
  extracted_fields: Record<string, string> | null;
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

/** Uma resposta serve de título quando parece um NOME de processo, não uma
 * resposta solta do meio da entrevista (ex.: "Não", "20 casos por semana"). */
function looksLikeName(s: string): boolean {
  const t = s.trim();
  if (t.length < 3 || t.length > 70) return false;
  if (/^(sim|n[aã]o|ok|talvez|acho|isso)\b/i.test(t)) return false;
  if (/^\d/.test(t)) return false; // começa com número (métrica, volume…)
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
    .map(toItem)
    // ignora conversas vazias (só a abertura, sem nenhuma resposta do usuário)
    .filter((c) => c.userMessageCount > 0);
}

/** Conversas que ainda dá para retomar a entrevista (não concluídas), mais
 * recentes primeiro. Usada para oferecer "continuar de onde parou". */
export async function listResumableConversations(limit = 6): Promise<ConversationListItem[]> {
  return (await listConversations()).filter((c) => c.status !== "concluida").slice(0, limit);
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("ai_conversation")
    .select(SELECT_COLS)
    .eq("id", id)
    .single();
  if (error || !data) return null;

  const row = data as unknown as Row;
  return { ...toItem(row), messages: normalizeMessages(row.messages), extractedFields: row.extracted_fields ?? {} };
}
