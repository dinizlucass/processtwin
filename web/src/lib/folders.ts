// Lógica pura de pastas (client-safe) — usada pelo RepositoryExplorer.

export interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  position: number;
}

export interface FolderNode extends FolderRow {
  children: FolderNode[];
  directCount: number; // processos diretamente nesta pasta
  totalCount: number; // processos nesta pasta + todas as descendentes
}

export interface FolderTree {
  roots: FolderNode[];
  byId: Map<string, FolderNode>;
  unfiled: number; // processos sem pasta
  total: number; // total de processos
}

/** Monta a árvore de pastas com contagens (diretas e recursivas) a partir das
 * pastas e dos folderId de cada processo. */
export function buildFolderTree(folders: FolderRow[], processFolderIds: (string | null)[]): FolderTree {
  const direct = new Map<string, number>();
  let unfiled = 0;
  for (const fid of processFolderIds) {
    if (fid == null) unfiled++;
    else direct.set(fid, (direct.get(fid) ?? 0) + 1);
  }

  const byId = new Map<string, FolderNode>();
  for (const f of folders) {
    byId.set(f.id, { ...f, children: [], directCount: direct.get(f.id) ?? 0, totalCount: 0 });
  }

  const roots: FolderNode[] = [];
  for (const f of folders) {
    const node = byId.get(f.id)!;
    const parent = f.parentId ? byId.get(f.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortRec = (arr: FolderNode[]) => {
    arr.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR"));
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);

  const computeTotal = (n: FolderNode): number => {
    n.totalCount = n.directCount + n.children.reduce((s, c) => s + computeTotal(c), 0);
    return n.totalCount;
  };
  roots.forEach(computeTotal);

  return { roots, byId, unfiled, total: processFolderIds.length };
}

/** Conjunto de ids da subárvore (a própria pasta + todas as descendentes). */
export function subtreeIds(node: FolderNode): Set<string> {
  const ids = new Set<string>();
  const walk = (n: FolderNode) => {
    ids.add(n.id);
    n.children.forEach(walk);
  };
  walk(node);
  return ids;
}

/** Lista achatada (pré-ordem) com nível de profundidade — útil para dropdowns "Mover para…". */
export function flattenFolders(roots: FolderNode[]): { node: FolderNode; depth: number }[] {
  const out: { node: FolderNode; depth: number }[] = [];
  const walk = (n: FolderNode, depth: number) => {
    out.push({ node: n, depth });
    n.children.forEach((c) => walk(c, depth + 1));
  };
  roots.forEach((r) => walk(r, 0));
  return out;
}
