export type ProcessField = "name" | "owner" | "criticality" | "ai" | "esg" | "systems";

export interface ScriptStep {
  q: string;
  field: ProcessField;
  suggest: string;
  ph: string;
}

export const chatScript: ScriptStep[] = [
  {
    q: "Olá! Vou te ajudar a mapear um novo processo. Para começar: qual é o nome do processo que vamos documentar?",
    field: "name",
    suggest: "Admissão de Colaboradores",
    ph: "Digite o nome do processo...",
  },
  {
    q: "Ótimo. Quem é a pessoa responsável por esse processo (Process Owner)?",
    field: "owner",
    suggest: "Ana Souza — Coordenadora de RH",
    ph: "Nome e cargo do responsável...",
  },
  {
    q: "Entendi. Qual a criticidade desse processo para o negócio: Alta, Média ou Baixa?",
    field: "criticality",
    suggest: "Alta",
    ph: "Alta, Média ou Baixa...",
  },
  {
    q: "Anotado. Esse processo utiliza IA em alguma etapa?",
    field: "ai",
    suggest: "Sim — triagem automática de currículos",
    ph: "Sim/Não e em qual etapa...",
  },
  {
    q: "Existe algum impacto ESG relacionado (Ambiental, Social, Governança)?",
    field: "esg",
    suggest: "Social · Governança",
    ph: "Tags ESG aplicáveis...",
  },
  {
    q: "Por fim: quais sistemas estão envolvidos na execução?",
    field: "systems",
    suggest: "Gupy, TOTVS RH, DocuSign",
    ph: "Liste os sistemas...",
  },
];

export const fieldDefs: { key: ProcessField; label: string }[] = [
  { key: "name", label: "Nome do Processo" },
  { key: "owner", label: "Responsável" },
  { key: "criticality", label: "Criticidade" },
  { key: "ai", label: "Uso de IA" },
  { key: "esg", label: "Impacto ESG" },
  { key: "systems", label: "Sistemas Envolvidos" },
];
