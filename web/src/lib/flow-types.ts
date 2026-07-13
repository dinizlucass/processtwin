export type NodeKind = "start" | "end" | "task" | "decision";

export type ActivityType = "manual" | "semiautomatica" | "automatizada";

export interface FlowNodeData extends Record<string, unknown> {
  kind: NodeKind;
  label: string;
  actor?: string;
  activityType?: ActivityType;
  alertFrequency?: string;
  tags?: string[];
  usesAI?: boolean;
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
