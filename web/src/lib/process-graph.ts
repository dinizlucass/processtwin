// Construtor PURO do grafo de processos (client-safe: sem server-only/Supabase).
// Modelo object-centric: processos ligam-se a NÓS-OBJETO (pasta, departamento,
// sistema) — evita cliques O(n²) e dá o visual "hub de grupo" (Obsidian/OCPM).

import type { FolderRow } from "@/lib/folders";
import type { ProcessListItem } from "@/lib/queries/processes";

// Mesma paleta do RepositoryExplorer (duplicada de propósito no v1).
export const FOLDER_COLORS = ["#6366f1", "#0d9488", "#d97706", "#db2777", "#2563eb", "#475569"];

const DEPT_COLOR = "#6366f1"; // accent-2
const SYSTEM_COLOR = "#0891b2"; // teal — distinto para leitura OCPM
const PROCESS_FALLBACK = "#94a3b8";
const CRIT_COLOR: Record<string, string> = { alta: "#ef4444", media: "#f59e0b", baixa: "#10b981" };

export type GraphNodeType = "process" | "folder" | "department" | "system";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  name: string;
  val: number; // raio ∝ grau (calculado ao final)
  color: string;
  // process
  processId?: string;
  code?: string;
  criticality?: "alta" | "media" | "baixa" | null;
  status?: string;
  ownerName?: string | null;
  mapped?: boolean;
  folderId?: string | null;
  department?: string | null;
  // nó-objeto (pasta/departamento/sistema)
  memberProcessIds?: string[];
  // x/y/vx/vy são adicionados pelo force-graph em runtime.
}

export interface GraphLink {
  source: string;
  target: string;
  kind: "folder" | "department" | "system";
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface BuildOptions {
  showFolders: boolean;
  showDepartments: boolean;
  showSystems: boolean;
  colorBy: "folder" | "criticality";
}

/** Normaliza texto livre (departamento/sistema) para chave de agrupamento. */
export function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Cor de cada pasta: usa a cor definida, senão cai na paleta por índice. */
export function resolveFolderColors(folders: FolderRow[]): Map<string, string> {
  const m = new Map<string, string>();
  folders.forEach((f, i) => m.set(f.id, f.color || FOLDER_COLORS[i % FOLDER_COLORS.length]));
  return m;
}

function pushMap(map: Map<string, string[]>, key: string, value: string) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function processColor(p: ProcessListItem, options: BuildOptions, folderColor: Map<string, string>): string {
  if (options.colorBy === "criticality") return (p.criticality && CRIT_COLOR[p.criticality]) || PROCESS_FALLBACK;
  if (p.folderId && folderColor.has(p.folderId)) return folderColor.get(p.folderId)!;
  return PROCESS_FALLBACK;
}

export function buildProcessGraph(
  processes: ProcessListItem[],
  folders: FolderRow[],
  systemsByProcess: Record<string, string[]>,
  options: BuildOptions,
): GraphData {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const folderColor = resolveFolderColors(folders);

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  const folderMembers = new Map<string, string[]>();
  const deptMembers = new Map<string, string[]>();
  const deptName = new Map<string, string>();
  const sysMembers = new Map<string, string[]>();
  const sysName = new Map<string, string>();

  for (const p of processes) {
    const id = `proc:${p.id}`;
    nodes.push({
      id,
      type: "process",
      name: p.name,
      val: 4,
      color: processColor(p, options, folderColor),
      processId: p.id,
      code: p.code,
      criticality: p.criticality,
      status: p.status,
      ownerName: p.ownerName,
      mapped: p.mapped,
      folderId: p.folderId,
      department: p.department,
    });

    if (options.showFolders && p.folderId && folderById.has(p.folderId)) {
      links.push({ source: id, target: `folder:${p.folderId}`, kind: "folder" });
      bump(id);
      bump(`folder:${p.folderId}`);
      pushMap(folderMembers, p.folderId, p.id);
    }

    if (options.showDepartments && p.department) {
      const slug = normalizeKey(p.department);
      if (slug) {
        links.push({ source: id, target: `dept:${slug}`, kind: "department" });
        bump(id);
        bump(`dept:${slug}`);
        if (!deptName.has(slug)) deptName.set(slug, p.department);
        pushMap(deptMembers, slug, p.id);
      }
    }

    if (options.showSystems) {
      for (const s of systemsByProcess[p.id] ?? []) {
        const slug = normalizeKey(s);
        if (!slug) continue;
        links.push({ source: id, target: `sys:${slug}`, kind: "system" });
        bump(id);
        bump(`sys:${slug}`);
        if (!sysName.has(slug)) sysName.set(slug, s);
        pushMap(sysMembers, slug, p.id);
      }
    }
  }

  // nós-objeto (só os que receberam ligações)
  for (const [fid, members] of folderMembers) {
    nodes.push({
      id: `folder:${fid}`,
      type: "folder",
      name: folderById.get(fid)?.name ?? "Pasta",
      val: 4,
      color: folderColor.get(fid) ?? FOLDER_COLORS[0],
      memberProcessIds: members,
    });
  }
  for (const [slug, members] of deptMembers) {
    nodes.push({ id: `dept:${slug}`, type: "department", name: deptName.get(slug)!, val: 4, color: DEPT_COLOR, memberProcessIds: members });
  }
  for (const [slug, members] of sysMembers) {
    nodes.push({ id: `sys:${slug}`, type: "system", name: sysName.get(slug)!, val: 4, color: SYSTEM_COLOR, memberProcessIds: members });
  }

  // tamanho por grau (sqrt para hubs não explodirem)
  for (const n of nodes) {
    const d = degree.get(n.id) ?? 0;
    const base = n.type === "process" ? 3 : 4.5;
    n.val = base + Math.sqrt(d) * 2.2;
  }

  return { nodes, links };
}
