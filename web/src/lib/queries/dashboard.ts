import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Tone } from "@/lib/mock-data";

// Seção 10.2 do doc de governança B3: frequência de revisão obrigatória por criticidade
const REVIEW_WINDOW_DAYS: Record<string, number> = {
  alta: 365,
  media: 548, // 18 meses
  baixa: 730, // 24 meses
};

interface ProcessRow {
  id: string;
  name: string;
  department: string | null;
  criticality: "alta" | "media" | "baixa" | null;
  status: string;
  last_reviewed_at: string | null;
  owner: { name: string } | null;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function isOverdue(p: ProcessRow): boolean {
  const since = daysSince(p.last_reviewed_at);
  if (since == null || !p.criticality) return false;
  return since > REVIEW_WINDOW_DAYS[p.criticality];
}

function daysUntilDue(p: ProcessRow): number | null {
  const since = daysSince(p.last_reviewed_at);
  if (since == null || !p.criticality) return null;
  return REVIEW_WINDOW_DAYS[p.criticality] - since;
}

export async function getDashboardData() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("process")
    .select("id,name,department,criticality,status,last_reviewed_at,owner:owner_id(name)");

  if (error) throw new Error(`Falha ao consultar processos: ${error.message}`);
  const processes = (data ?? []) as unknown as ProcessRow[];

  const { data: mappedRows } = await supabase.from("flow_node").select("process_id");
  const mappedProcessIds = (mappedRows ?? []) as { process_id: string }[];
  const mappedSet = new Set(mappedProcessIds.map((r) => r.process_id));

  const total = processes.length;
  const criticos = processes.filter((p) => p.criticality === "alta").length;
  const desatualizados = processes.filter(isOverdue).length;
  const coberturaPct = total > 0 ? Math.round((mappedSet.size / total) * 100) : 0;

  const kpis = [
    { label: "Total de Processos", value: String(total), note: `${total} no repositório`, tone: "success" as Tone },
    {
      label: "Processos Críticos",
      value: String(criticos),
      note: total > 0 ? `${Math.round((criticos / total) * 100)}% do repositório` : "—",
      tone: "danger" as Tone,
      valueTone: "danger" as Tone,
    },
    {
      label: "Desatualizados",
      value: String(desatualizados),
      note: "Alertas de governança",
      tone: "warning" as Tone,
      valueTone: "warning" as Tone,
    },
    {
      label: "Cobertura de Mapeamento",
      value: `${coberturaPct}%`,
      note: null,
      tone: "accent" as Tone,
      valueTone: "accent" as Tone,
      progress: coberturaPct,
    },
  ];

  const byDept = new Map<string, ProcessRow[]>();
  for (const p of processes) {
    const dept = p.department ?? "Sem área";
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept)!.push(p);
  }
  const departmentMaturity = Array.from(byDept.entries())
    .map(([name, rows]) => {
      const upToDate = rows.filter((p) => !isOverdue(p)).length;
      const pct = Math.round((upToDate / rows.length) * 100);
      return { name, pct, tone: (pct >= 80 ? "success" : pct >= 60 ? "warning" : "danger") as Tone };
    })
    .sort((a, b) => b.pct - a.pct);

  const pendingAlerts: { title: string; desc: string; badge: string; tone: Tone }[] = [];
  for (const p of processes) {
    const overdue = isOverdue(p);
    const dueIn = daysUntilDue(p);
    const ownerName = p.owner?.name ?? "sem responsável definido";
    if (overdue) {
      pendingAlerts.push({
        title: `${p.name} está com a revisão atrasada`,
        desc: `Responsável: ${ownerName} · ${p.department ?? "—"}`,
        badge: p.criticality === "alta" ? "Crítico" : "Atrasado",
        tone: "danger",
      });
    } else if (dueIn != null && dueIn <= 15) {
      pendingAlerts.push({
        title: `Revisão de ${p.name} vence em ${dueIn} dias`,
        desc: `Responsável: ${ownerName} · ${p.department ?? "—"}`,
        badge: "Atenção",
        tone: "warning",
      });
    } else if (p.status === "em_revisao") {
      pendingAlerts.push({
        title: `${p.name} aguardando aprovação de publicação`,
        desc: `Fila de governança · ${p.department ?? "—"}`,
        badge: "Pendente",
        tone: "accent",
      });
    }
  }

  return { kpis, departmentMaturity, pendingAlerts: pendingAlerts.slice(0, 6) };
}
