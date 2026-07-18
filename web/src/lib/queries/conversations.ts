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
}

interface Row {
  id: string;
  messages: ConversationMessage[] | null;
  status: string;
  created_at: string;
  updated_at: string;
  process_id: string | null;
  process: { name: string; code: string } | null;
}

const OPENING_PREFIX = "Vamos mapear este processo juntos";

function normalizeMessages(raw: ConversationMessage[] | null): ConversationMessage[] {
  return (raw ?? []).filter((m) => m && typeof m.text === "string" && (m.role === "ai" || m.role === "user"));
}

function deriveTitle(row: Row, messages: ConversationMessage[]): string {
  if (row.process?.name) return row.process.name;
  const firstUser = messages.find((m) => m.role === "user")?.text?.trim();
  if (firstUser) {
    // muitas vezes vem "Nome do processo — objetivo"; pega o nome antes do travessão
    const head = firstUser.split(/[—–-]/)[0].trim() || firstUser;
    return head.length > 60 ? `${head.slice(0, 60)}…` : head;
  }
  return "Conversa sem título";
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
    .select("id,messages,status,created_at,updated_at,process_id,process:process_id(name,code)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar conversas: ${error.message}`);

  return (data as unknown as Row[])
    .map(toItem)
    // ignora conversas vazias (só a abertura, sem nenhuma resposta do usuário)
    .filter((c) => c.userMessageCount > 0);
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("ai_conversation")
    .select("id,messages,status,created_at,updated_at,process_id,process:process_id(name,code)")
    .eq("id", id)
    .single();
  if (error || !data) return null;

  const row = data as unknown as Row;
  return { ...toItem(row), messages: normalizeMessages(row.messages) };
}
