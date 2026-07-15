export type NodeKind =
  | "start"
  | "end"
  | "intermediate"
  | "task"
  | "subprocess"
  | "decision"
  | "gateway_parallel"
  | "gateway_inclusive"
  | "data"
  | "annotation";

export type ActivityType = "manual" | "semiautomatica" | "automatizada";

export interface FlowNodeData extends Record<string, unknown> {
  kind: NodeKind;
  label: string;
  // Responsabilidade
  actor?: string;
  area?: string;
  // Execução (tarefas)
  activityType?: ActivityType;
  usesAI?: boolean;
  systems?: string[];
  inputs?: string;
  outputs?: string;
  sla?: string;
  cost?: string;
  // Controles
  controls?: string;
  exceptions?: string;
  kpi?: string;
  // Governança
  description?: string;
  documentation?: string;
  alertFrequency?: string;
  tags?: string[];
}

export const activityTypeLabel: Record<ActivityType, string> = {
  manual: "Manual",
  semiautomatica: "Semiautomática",
  automatizada: "Automatizada",
};

export const alertFrequencyOptions = [
  "Sem alerta",
  "A cada 30 dias",
  "A cada 60 dias",
  "A cada 90 dias",
  "A cada 180 dias",
];

// ---- Metadados por tipo de elemento (palette + painel) ----

export type PaletteGroup = "Eventos" | "Atividades" | "Gateways" | "Artefatos";

export interface NodeMeta {
  kind: NodeKind;
  label: string; // rótulo do tipo na palette
  group: PaletteGroup;
  defaultLabel: string; // rótulo inicial ao criar o nó
  typeName: string; // nome exibido no painel de propriedades
}

export const NODE_META: Record<NodeKind, NodeMeta> = {
  start: { kind: "start", label: "Início", group: "Eventos", defaultLabel: "Início", typeName: "Evento de Início" },
  intermediate: { kind: "intermediate", label: "Intermediário", group: "Eventos", defaultLabel: "Evento", typeName: "Evento Intermediário" },
  end: { kind: "end", label: "Fim", group: "Eventos", defaultLabel: "Fim", typeName: "Evento de Fim" },
  task: { kind: "task", label: "Tarefa", group: "Atividades", defaultLabel: "Nova Tarefa", typeName: "Tarefa" },
  subprocess: { kind: "subprocess", label: "Subprocesso", group: "Atividades", defaultLabel: "Subprocesso", typeName: "Subprocesso" },
  decision: { kind: "decision", label: "Exclusivo (XOR)", group: "Gateways", defaultLabel: "Decisão?", typeName: "Gateway Exclusivo" },
  gateway_parallel: { kind: "gateway_parallel", label: "Paralelo (AND)", group: "Gateways", defaultLabel: "Paralelo", typeName: "Gateway Paralelo" },
  gateway_inclusive: { kind: "gateway_inclusive", label: "Inclusivo (OR)", group: "Gateways", defaultLabel: "Inclusivo", typeName: "Gateway Inclusivo" },
  data: { kind: "data", label: "Objeto de Dados", group: "Artefatos", defaultLabel: "Documento", typeName: "Objeto de Dados" },
  annotation: { kind: "annotation", label: "Anotação", group: "Artefatos", defaultLabel: "Anotação…", typeName: "Anotação" },
};

export const PALETTE_GROUPS: PaletteGroup[] = ["Eventos", "Atividades", "Gateways", "Artefatos"];

// Dimensões iniciais por tipo — necessárias para o React Flow desenhar as
// arestas antes/independente da medição do DOM (isNodeInitialized usa
// initialWidth/initialHeight como fallback de measured).
export const NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
  start: { width: 48, height: 48 },
  end: { width: 48, height: 48 },
  intermediate: { width: 48, height: 48 },
  task: { width: 176, height: 72 },
  subprocess: { width: 176, height: 72 },
  decision: { width: 64, height: 64 },
  gateway_parallel: { width: 64, height: 64 },
  gateway_inclusive: { width: 64, height: 64 },
  data: { width: 124, height: 70 },
  annotation: { width: 200, height: 44 },
};

export function defaultDataForKind(kind: NodeKind): FlowNodeData {
  const base: FlowNodeData = { kind, label: NODE_META[kind].defaultLabel };
  if (kind === "task" || kind === "subprocess") {
    return { ...base, activityType: "manual", usesAI: false, systems: [], tags: [], alertFrequency: "Sem alerta" };
  }
  return base;
}

// Campos que persistem na coluna JSONB `attributes` (o resto vira coluna própria).
export const ATTRIBUTE_KEYS = [
  "area",
  "systems",
  "inputs",
  "outputs",
  "sla",
  "cost",
  "controls",
  "exceptions",
  "kpi",
  "description",
  "documentation",
] as const;
