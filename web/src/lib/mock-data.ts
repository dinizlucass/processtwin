export type Tone = "success" | "warning" | "danger" | "accent";

export const kpis = [
  { label: "Total de Processos", value: "128", note: "+9 este mês", tone: "success" as Tone },
  { label: "Processos Críticos", value: "17", note: "13% do repositório", tone: "danger" as Tone, valueTone: "danger" as Tone },
  { label: "Desatualizados", value: "9", note: "Alertas de governança", tone: "warning" as Tone, valueTone: "warning" as Tone },
  { label: "Cobertura de Mapeamento", value: "82%", note: null, tone: "accent" as Tone, valueTone: "accent" as Tone, progress: 82 },
];

export const departmentMaturity = [
  { name: "RH", pct: 92 },
  { name: "TI", pct: 88 },
  { name: "Vendas", pct: 85 },
  { name: "Financeiro", pct: 78 },
  { name: "Operações", pct: 61 },
  { name: "Jurídico", pct: 45 },
].map((d) => ({ ...d, tone: (d.pct >= 80 ? "success" : d.pct >= 60 ? "warning" : "danger") as Tone }));

export const pendingAlerts: { title: string; desc: string; badge: string; tone: Tone }[] = [
  {
    title: "O processo de Admissão expira em 5 dias",
    desc: "Responsável: Ana Souza · RH",
    badge: "Crítico",
    tone: "danger",
  },
  {
    title: "Revisão de Faturamento vence em 12 dias",
    desc: "Responsável: Carlos Lima · Financeiro",
    badge: "Atenção",
    tone: "warning",
  },
  {
    title: "Gestão de Fornecedores há 90 dias sem atualização",
    desc: "Responsável: Paula Reis · Compras",
    badge: "Atrasado",
    tone: "danger",
  },
  {
    title: "3 processos aguardando aprovação de publicação",
    desc: "Fila de governança · Comitê",
    badge: "Pendente",
    tone: "accent",
  },
];
