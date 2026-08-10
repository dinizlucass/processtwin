"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildFolderTree, flattenFolders, subtreeIds, type FolderNode, type FolderRow } from "@/lib/folders";
import { NewProcessForm } from "@/components/processes/NewProcessForm";
import { toneBadge } from "@/lib/tone";
import type { Tone } from "@/lib/mock-data";
import type { ProcessListItem } from "@/lib/queries/processes";

const criticalityTone: Record<string, Tone> = { alta: "danger", media: "warning", baixa: "success" };
const criticalityLabel: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const criticalityOrder: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
const statusTone: Record<string, Tone> = { rascunho: "accent", em_revisao: "warning", publicado: "success", obsoleto: "danger" };
const statusLabel: Record<string, string> = { rascunho: "Rascunho", em_revisao: "Em revisão", publicado: "Publicado", obsoleto: "Obsoleto" };
const statusOrder: Record<string, number> = { publicado: 0, em_revisao: 1, rascunho: 2, obsoleto: 3 };

const FOLDER_COLORS = ["#6366f1", "#0d9488", "#d97706", "#db2777", "#2563eb", "#475569"];
const AVATAR_COLORS = ["#6366f1", "#0d9488", "#d97706", "#db2777", "#2563eb", "#7c3aed", "#0891b2", "#c2410c"];

type Selection = "all" | "unfiled" | string; // string = folderId
type ViewMode = "table" | "cards";
type SortKey = "name" | "criticality" | "status" | "mapped" | "department";
type SortDir = "asc" | "desc";

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function folderPath(node: FolderNode, byId: Map<string, FolderNode>): FolderNode[] {
  const path: FolderNode[] = [];
  let cur: FolderNode | undefined = node;
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

export function RepositoryExplorer({ folders, processes }: { folders: FolderRow[]; processes: ProcessListItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Selection>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // controles da barra de ferramentas
  const [query, setQuery] = useState("");
  const [fDept, setFDept] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fCrit, setFCrit] = useState("");
  const [fMapped, setFMapped] = useState<"" | "sim" | "nao">("");
  const [view, setView] = useState<ViewMode>("table");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildFolderTree(folders, processes.map((p) => p.folderId)), [folders, processes]);
  const flat = useMemo(() => flattenFolders(tree.roots), [tree]);

  const selectedNode = selected !== "all" && selected !== "unfiled" ? tree.byId.get(selected) ?? null : null;

  // processos da pasta selecionada (inclui subpastas)
  const scoped = useMemo(() => {
    if (selected === "all") return processes;
    if (selected === "unfiled") return processes.filter((p) => p.folderId == null);
    if (!selectedNode) return [];
    const ids = subtreeIds(selectedNode);
    return processes.filter((p) => p.folderId && ids.has(p.folderId));
  }, [selected, selectedNode, processes]);

  const departments = useMemo(
    () => Array.from(new Set(processes.map((p) => p.department).filter((d): d is string => !!d))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [processes],
  );

  // aplica busca + filtros + ordenação
  const visible = useMemo(() => {
    const q = normalize(query.trim());
    let list = scoped.filter((p) => {
      if (q && !normalize(`${p.name} ${p.code} ${p.ownerName ?? ""} ${p.department ?? ""}`).includes(q)) return false;
      if (fDept && p.department !== fDept) return false;
      if (fStatus && p.status !== fStatus) return false;
      if (fCrit && p.criticality !== fCrit) return false;
      if (fMapped === "sim" && !p.mapped) return false;
      if (fMapped === "nao" && p.mapped) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      let c = 0;
      if (sortKey === "name") c = a.name.localeCompare(b.name, "pt-BR");
      else if (sortKey === "department") c = (a.department ?? "").localeCompare(b.department ?? "", "pt-BR");
      else if (sortKey === "criticality") c = (criticalityOrder[a.criticality ?? ""] ?? 9) - (criticalityOrder[b.criticality ?? ""] ?? 9);
      else if (sortKey === "status") c = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      else if (sortKey === "mapped") c = Number(b.mapped) - Number(a.mapped);
      if (c === 0) c = a.name.localeCompare(b.name, "pt-BR");
      return c * dir;
    });
    return list;
  }, [scoped, query, fDept, fStatus, fCrit, fMapped, sortKey, sortDir]);

  const stats = useMemo(() => {
    const total = scoped.length;
    const mapped = scoped.filter((p) => p.mapped).length;
    const published = scoped.filter((p) => p.status === "publicado").length;
    const high = scoped.filter((p) => p.criticality === "alta").length;
    return { total, mapped, published, high, pct: total ? Math.round((mapped / total) * 100) : 0 };
  }, [scoped]);

  const activeFilters = (fDept ? 1 : 0) + (fStatus ? 1 : 0) + (fCrit ? 1 : 0) + (fMapped ? 1 : 0) + (query.trim() ? 1 : 0);
  const currentParentForNew = selectedNode ? selectedNode.id : null;
  const path = selectedNode ? folderPath(selectedNode, tree.byId) : [];

  const pickedList = useMemo(() => visible.filter((p) => picked.has(p.id)), [visible, picked]);
  const allVisiblePicked = visible.length > 0 && visible.every((p) => picked.has(p.id));

  function clearFilters() {
    setQuery("");
    setFDept("");
    setFStatus("");
    setFCrit("");
    setFMapped("");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function togglePick(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function togglePickAll() {
    setPicked((s) => {
      if (allVisiblePicked) {
        const n = new Set(s);
        visible.forEach((p) => n.delete(p.id));
        return n;
      }
      const n = new Set(s);
      visible.forEach((p) => n.add(p.id));
      return n;
    });
  }

  function toggleSelectMode() {
    setSelecting((on) => {
      if (on) setPicked(new Set()); // saindo do modo seleção: limpa
      return !on;
    });
  }

  async function api(url: string, method: string, body?: unknown): Promise<Response | null> {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Falha na operação.");
        return null;
      }
      router.refresh();
      return res;
    } finally {
      setBusy(false);
      setMenuId(null);
    }
  }

  async function bulkMove(folderId: string | null) {
    if (pickedList.length === 0) return;
    setBusy(true);
    try {
      for (const p of pickedList) {
        await fetch(`/api/processes/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId }),
        });
      }
      setPicked(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function createFolder(parentId: string | null) {
    const res = await api("/api/folders", "POST", { name: "Nova pasta", parentId });
    if (!res) return;
    const { folder } = (await res.json()) as { folder: { id: string } };
    if (parentId) setExpanded((s) => new Set(s).add(parentId));
    setEditingId(folder.id);
  }

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="flex h-full min-h-0 bg-page">
      {/* ÁRVORE DE PASTAS */}
      <aside className="flex w-[272px] flex-none flex-col border-r border-border bg-surface">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-[10.5px] font-bold tracking-[.09em] text-slate-400 uppercase">Repositório</span>
          <button
            onClick={() => createFolder(currentParentForNew)}
            disabled={busy}
            className="flex items-center gap-1 rounded-[8px] border border-accent-soft-border bg-accent-soft px-2 py-1 text-[11px] font-bold text-accent-hover hover:bg-indigo-100 disabled:opacity-50"
            title={currentParentForNew ? "Nova subpasta na pasta selecionada" : "Nova pasta na raiz"}
          >
            <PlusIcon /> Pasta
          </button>
        </div>

        <div className="flex-1 overflow-auto px-2 pb-4">
          <RootRow icon={<StackIcon />} label="Todos os processos" count={tree.total} active={selected === "all"} onClick={() => setSelected("all")} />
          <RootRow icon={<InboxIcon />} label="Sem pasta" count={tree.unfiled} active={selected === "unfiled"} onClick={() => setSelected("unfiled")} />
          <div className="mx-2 my-2 border-t border-border-soft" />
          <div className="px-2.5 pb-1 text-[10px] font-bold tracking-[.08em] text-slate-400 uppercase">Pastas</div>
          {tree.roots.map((n) => (
            <FolderRowView
              key={n.id}
              node={n}
              depth={0}
              expanded={expanded}
              selected={selected}
              editingId={editingId}
              menuId={menuId}
              busy={busy}
              flat={flat}
              onToggle={toggle}
              onSelect={setSelected}
              onStartRename={setEditingId}
              onRename={(id, name) => {
                setEditingId(null);
                if (name.trim()) api(`/api/folders/${id}`, "PATCH", { name });
              }}
              onCancelRename={() => setEditingId(null)}
              onMenu={setMenuId}
              onNewSub={createFolder}
              onMove={(id, parentId) => api(`/api/folders/${id}`, "PATCH", { parentId })}
              onColor={(id, color) => api(`/api/folders/${id}`, "PATCH", { color })}
              onDelete={(id, name) => {
                if (confirm(`Excluir a pasta "${name}"? As subpastas e processos dela sobem para a pasta acima.`))
                  api(`/api/folders/${id}`, "DELETE");
              }}
            />
          ))}
          {tree.roots.length === 0 && (
            <div className="mx-1 mt-1 rounded-[10px] border border-dashed border-border bg-page/60 px-3 py-4 text-[11.5px] leading-snug text-slate-400">
              Nenhuma pasta ainda. Crie a primeira em <b className="text-slate-500">+ Pasta</b> para organizar por área ou macroprocesso.
            </div>
          )}
        </div>

        <div className="border-t border-border-soft px-4 py-3 text-[10.5px] leading-relaxed text-slate-400">
          Organize por <b className="text-slate-500">área</b> ou <b className="text-slate-500">macroprocesso</b>. A hierarquia vira grafo no futuro.
        </div>
      </aside>

      {/* PAINEL PRINCIPAL */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {/* Cabeçalho */}
        <div className="flex-none px-8 pt-6">
          <nav className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-400">
            <button onClick={() => setSelected("all")} className="hover:text-slate-600">Repositório</button>
            {selected === "unfiled" && (
              <>
                <ChevronMini /> <span className="text-slate-600">Sem pasta</span>
              </>
            )}
            {path.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1.5">
                <ChevronMini />
                <button
                  onClick={() => setSelected(f.id)}
                  className={i === path.length - 1 ? "text-slate-600" : "hover:text-slate-600"}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </nav>

          <div className="mt-2 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="m-0 flex items-center gap-2.5 text-[22px] font-bold tracking-tight text-ink">
                {selectedNode && <span className="h-3.5 w-3.5 rounded-[5px]" style={{ background: selectedNode.color || FOLDER_COLORS[0] }} />}
                {selected === "all" ? "Todos os processos" : selected === "unfiled" ? "Sem pasta" : selectedNode?.name}
              </h1>
              <p className="mt-1 text-[12.5px] text-muted">
                {stats.total} {stats.total === 1 ? "processo" : "processos"}
                {selectedNode && selectedNode.children.length > 0 ? " · inclui subpastas" : ""}
                {" · "}
                {stats.pct}% mapeado
              </p>
            </div>
            <NewProcessForm folderId={currentParentForNew} folderName={selectedNode?.name} />
          </div>

          {/* KPIs */}
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Processos" value={stats.total} icon={<StackIcon />} tone="accent" />
            <Stat label="Mapeados" value={`${stats.mapped}/${stats.total}`} sub={`${stats.pct}%`} icon={<CheckIcon />} tone="success" barPct={stats.pct} />
            <Stat label="Publicados" value={stats.published} icon={<SendIcon />} tone="accent" />
            <Stat label="Criticidade alta" value={stats.high} icon={<AlertIcon />} tone="danger" />
          </div>

          {/* Toolbar */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400">
                <SearchIcon />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, código, dono…"
                className="h-9 w-64 rounded-[10px] border border-border bg-surface pr-3 pl-9 text-[12.5px] outline-none focus:border-accent-2"
              />
            </div>

            <Select value={fDept} onChange={setFDept} label="Departamento">
              <option value="">Departamento: todos</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
            <Select value={fStatus} onChange={setFStatus} label="Status">
              <option value="">Status: todos</option>
              <option value="rascunho">Rascunho</option>
              <option value="em_revisao">Em revisão</option>
              <option value="publicado">Publicado</option>
              <option value="obsoleto">Obsoleto</option>
            </Select>
            <Select value={fCrit} onChange={setFCrit} label="Criticidade">
              <option value="">Criticidade: todas</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </Select>
            <Select value={fMapped} onChange={(v) => setFMapped(v as "" | "sim" | "nao")} label="Mapeado">
              <option value="">Mapeado: todos</option>
              <option value="sim">Mapeado</option>
              <option value="nao">Não mapeado</option>
            </Select>

            {activeFilters > 0 && (
              <button onClick={clearFilters} className="h-9 rounded-[10px] px-2.5 text-[12px] font-semibold text-accent hover:bg-accent-soft">
                Limpar ({activeFilters})
              </button>
            )}

            {view === "table" && (
              <button
                onClick={toggleSelectMode}
                className={`ml-auto flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[12px] font-semibold ${
                  selecting ? "border-accent bg-accent-soft text-accent-hover" : "border-border bg-surface text-slate-600 hover:bg-page"
                }`}
              >
                {selecting ? <><CheckIcon /> Concluir</> : <><CheckSquareIcon /> Selecionar</>}
              </button>
            )}

            <div className={`flex items-center gap-1 rounded-[10px] border border-border bg-surface p-0.5 ${view === "table" ? "" : "ml-auto"}`}>
              <ViewToggle active={view === "table"} onClick={() => setView("table")} label="Tabela"><TableIcon /></ViewToggle>
              <ViewToggle active={view === "cards"} onClick={() => { setView("cards"); setSelecting(false); setPicked(new Set()); }} label="Cartões"><GridIcon /></ViewToggle>
            </div>
          </div>
        </div>

        {/* Barra de seleção em massa */}
        {pickedList.length > 0 && (
          <div className="sticky top-0 z-10 mx-8 mt-4 flex items-center gap-3 rounded-[12px] border border-accent-soft-border bg-accent-soft px-4 py-2.5 shadow-sm">
            <span className="text-[12.5px] font-bold text-accent-hover">{pickedList.length} selecionado{pickedList.length > 1 ? "s" : ""}</span>
            <BulkMoveMenu flat={flat} disabled={busy} onMove={bulkMove} />
            <button onClick={() => setPicked(new Set())} className="text-[12px] font-semibold text-slate-500 hover:text-slate-700">
              Limpar seleção
            </button>
          </div>
        )}

        {/* Conteúdo */}
        <div className="flex-1 px-8 pt-4 pb-8">
          {visible.length === 0 ? (
            <EmptyState hasFilters={activeFilters > 0} onClear={clearFilters} />
          ) : view === "table" ? (
            <TableView
              rows={visible}
              flat={flat}
              busy={busy}
              selecting={selecting}
              picked={picked}
              allPicked={allVisiblePicked}
              sortKey={sortKey}
              sortDir={sortDir}
              onToggleSort={toggleSort}
              onTogglePick={togglePick}
              onTogglePickAll={togglePickAll}
              onMove={(pid, folderId) => api(`/api/processes/${pid}`, "PATCH", { folderId })}
            />
          ) : (
            <CardsView rows={visible} flat={flat} busy={busy} onMove={(pid, folderId) => api(`/api/processes/${pid}`, "PATCH", { folderId })} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Tabela ---------- */

function TableView({
  rows,
  flat,
  busy,
  selecting,
  picked,
  allPicked,
  sortKey,
  sortDir,
  onToggleSort,
  onTogglePick,
  onTogglePickAll,
  onMove,
}: {
  rows: ProcessListItem[];
  flat: { node: FolderNode; depth: number }[];
  busy: boolean;
  selecting: boolean;
  picked: Set<string>;
  allPicked: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (k: SortKey) => void;
  onTogglePick: (id: string) => void;
  onTogglePickAll: () => void;
  onMove: (pid: string, folderId: string | null) => void;
}) {
  const cols = selecting
    ? "grid-cols-[32px_2.3fr_1fr_0.9fr_1fr_0.7fr_1.2fr]"
    : "grid-cols-[2.3fr_1fr_0.9fr_1fr_0.7fr_1.2fr]";
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-surface shadow-sm">
      <div className={`grid ${cols} items-center gap-3 border-b border-border bg-page/70 px-4 py-2.5 text-[10.5px] font-bold tracking-[.06em] text-muted uppercase`}>
        {selecting && <Checkbox checked={allPicked} onChange={onTogglePickAll} />}
        <SortHeader label="Processo" k="name" active={sortKey} dir={sortDir} onClick={onToggleSort} />
        <SortHeader label="Departamento" k="department" active={sortKey} dir={sortDir} onClick={onToggleSort} />
        <SortHeader label="Criticidade" k="criticality" active={sortKey} dir={sortDir} onClick={onToggleSort} />
        <SortHeader label="Status" k="status" active={sortKey} dir={sortDir} onClick={onToggleSort} />
        <SortHeader label="Mapeado" k="mapped" active={sortKey} dir={sortDir} onClick={onToggleSort} />
        <span className="text-right">Ações</span>
      </div>
      {rows.map((p) => (
        <div
          key={p.id}
          className={`group grid ${cols} items-center gap-3 border-b border-border-soft px-4 py-3 text-[12.5px] transition-colors last:border-b-0 hover:bg-accent-soft/40 ${
            selecting && picked.has(p.id) ? "bg-accent-soft/50" : ""
          }`}
        >
          {selecting && <Checkbox checked={picked.has(p.id)} onChange={() => onTogglePick(p.id)} />}
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: avatarColor(p.ownerName ?? p.name) }}
              title={p.ownerName ?? undefined}
            >
              {initials(p.ownerName ?? p.name)}
            </span>
            <div className="min-w-0">
              <Link href={`/modelagem/${p.id}`} className="block truncate font-bold text-ink hover:text-accent">
                {p.name}
              </Link>
              <div className="truncate text-[11px] text-muted">
                <span className="font-mono">{p.code}</span>
                {p.ownerName ? ` · ${p.ownerName}` : ""}
              </div>
            </div>
          </div>
          <span className="truncate text-slate-600">{p.department ?? "—"}</span>
          <span>
            {p.criticality ? (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${toneBadge[criticalityTone[p.criticality]]}`}>
                {criticalityLabel[p.criticality]}
              </span>
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </span>
          <span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${toneBadge[statusTone[p.status] ?? "accent"]}`}>
              {statusLabel[p.status] ?? p.status}
            </span>
          </span>
          <span>
            {p.mapped ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success-strong"><Dot className="bg-success" /> Sim</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400"><Dot className="bg-slate-300" /> Não</span>
            )}
          </span>
          <div className="flex items-center justify-end gap-2">
            <Link
              href={`/modelagem/${p.id}`}
              className="rounded-[8px] px-2.5 py-1 text-[12px] font-bold text-accent opacity-90 hover:bg-accent-soft"
            >
              {p.mapped ? "Abrir →" : "Mapear →"}
            </Link>
            <MoveMenu current={p.folderId} flat={flat} disabled={busy} onMove={(folderId) => onMove(p.id, folderId)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Cartões ---------- */

function CardsView({
  rows,
  flat,
  busy,
  onMove,
}: {
  rows: ProcessListItem[];
  flat: { node: FolderNode; depth: number }[];
  busy: boolean;
  onMove: (pid: string, folderId: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((p) => (
        <div key={p.id} className="group flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] text-[12px] font-bold text-white"
                style={{ background: avatarColor(p.ownerName ?? p.name) }}
              >
                {initials(p.ownerName ?? p.name)}
              </span>
              <div className="min-w-0">
                <Link href={`/modelagem/${p.id}`} className="block truncate text-[14px] font-bold text-ink hover:text-accent">
                  {p.name}
                </Link>
                <div className="truncate font-mono text-[10.5px] text-muted">{p.code}</div>
              </div>
            </div>
            <MoveMenu current={p.folderId} flat={flat} disabled={busy} onMove={(folderId) => onMove(p.id, folderId)} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {p.criticality && (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${toneBadge[criticalityTone[p.criticality]]}`}>
                {criticalityLabel[p.criticality]}
              </span>
            )}
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${toneBadge[statusTone[p.status] ?? "accent"]}`}>
              {statusLabel[p.status] ?? p.status}
            </span>
            {p.department && (
              <span className="inline-flex rounded-full bg-page px-2 py-0.5 text-[10px] font-semibold text-slate-500">{p.department}</span>
            )}
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-border-soft pt-3">
            <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${p.mapped ? "text-success-strong" : "text-slate-400"}`}>
              <Dot className={p.mapped ? "bg-success" : "bg-slate-300"} /> {p.mapped ? "Mapeado" : "Não mapeado"}
            </span>
            <Link href={`/modelagem/${p.id}`} className="text-[12px] font-bold text-accent hover:text-accent-hover">
              {p.mapped ? "Abrir →" : "Mapear →"}
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Peças de UI ---------- */

function Stat({ label, value, sub, icon, tone, barPct }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; tone: Tone; barPct?: number }) {
  const iconTone: Record<Tone, string> = {
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success-strong",
    warning: "bg-warning-soft text-warning-text",
    danger: "bg-danger-soft text-danger-strong",
  };
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-[9px] ${iconTone[tone]}`}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[24px] font-bold tracking-tight text-ink">{value}</span>
        {sub && <span className="text-[12px] font-semibold text-muted">{sub}</span>}
      </div>
      {typeof barPct === "number" && (
        <div className="h-1.5 overflow-hidden rounded-full bg-page">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${barPct}%` }} />
        </div>
      )}
    </div>
  );
}

function SortHeader({ label, k, active, dir, onClick }: { label: string; k: SortKey; active: SortKey; dir: SortDir; onClick: (k: SortKey) => void }) {
  const on = active === k;
  return (
    <button onClick={() => onClick(k)} className={`flex items-center gap-1 text-left uppercase ${on ? "text-accent" : "hover:text-slate-600"}`}>
      {label}
      <span className={`text-[9px] ${on ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}>{on ? (dir === "asc" ? "▲" : "▼") : "▲"}</span>
    </button>
  );
}

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 rounded-[10px] border bg-surface px-2.5 text-[12px] font-semibold outline-none focus:border-accent-2 ${
        value ? "border-accent-soft-border text-accent-hover" : "border-border text-slate-600"
      }`}
    >
      {children}
    </select>
  );
}

function ViewToggle({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-semibold ${
        active ? "bg-accent-soft text-accent-hover" : "text-slate-500 hover:bg-page"
      }`}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`flex h-4 w-4 items-center justify-center rounded-[5px] border transition-colors ${
        checked ? "border-accent bg-accent text-white" : "border-slate-300 bg-surface hover:border-accent-2"
      }`}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`h-1.5 w-1.5 rounded-full ${className}`} />;
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-border bg-surface px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-page text-slate-400">
        <StackIcon />
      </div>
      {hasFilters ? (
        <>
          <p className="mt-3 text-[13.5px] font-semibold text-slate-600">Nenhum processo bate com os filtros.</p>
          <button onClick={onClear} className="mt-2 text-[12.5px] font-bold text-accent hover:text-accent-hover">Limpar filtros</button>
        </>
      ) : (
        <p className="mt-3 max-w-sm text-[13px] text-muted">
          Nenhum processo aqui. Crie um em <b className="text-slate-600">+ Novo Processo</b>, mapeie pelo Copilot de IA, ou mova um processo existente para esta pasta.
        </p>
      )}
    </div>
  );
}

/* ---------- Árvore de pastas ---------- */

function RootRow({ icon, label, count, active, onClick }: { icon: React.ReactNode; label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[12.5px] font-semibold ${
        active ? "bg-accent-soft text-accent-hover" : "text-slate-600 hover:bg-page"
      }`}
    >
      <span className={active ? "text-accent" : "text-slate-400"}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <span className={`rounded-full px-1.5 text-[10px] font-bold ${active ? "bg-white text-accent" : "bg-page text-slate-400"}`}>{count}</span>
    </button>
  );
}

function FolderRowView({
  node,
  depth,
  expanded,
  selected,
  editingId,
  menuId,
  busy,
  flat,
  onToggle,
  onSelect,
  onStartRename,
  onRename,
  onCancelRename,
  onMenu,
  onNewSub,
  onMove,
  onColor,
  onDelete,
}: {
  node: FolderNode;
  depth: number;
  expanded: Set<string>;
  selected: Selection;
  editingId: string | null;
  menuId: string | null;
  busy: boolean;
  flat: { node: FolderNode; depth: number }[];
  onToggle: (id: string) => void;
  onSelect: (s: Selection) => void;
  onStartRename: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onCancelRename: () => void;
  onMenu: (id: string | null) => void;
  onNewSub: (parentId: string) => void;
  onMove: (id: string, parentId: string | null) => void;
  onColor: (id: string, color: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const isOpen = expanded.has(node.id);
  const isActive = selected === node.id;
  const color = node.color || FOLDER_COLORS[0];

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-[9px] py-1.5 pr-1 ${isActive ? "bg-accent-soft" : "hover:bg-page"}`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <button
          onClick={() => onToggle(node.id)}
          className={`flex h-4 w-4 flex-none items-center justify-center text-[9px] text-slate-400 transition-transform ${node.children.length ? "" : "invisible"} ${isOpen ? "rotate-90" : ""}`}
        >
          ▶
        </button>
        <span className="flex-none" style={{ color }}>
          <FolderIcon open={isOpen} />
        </span>

        {editingId === node.id ? (
          <input
            autoFocus
            defaultValue={node.name}
            onBlur={(e) => onRename(node.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") onCancelRename();
            }}
            className="min-w-0 flex-1 rounded border border-accent-2 px-1.5 py-0.5 text-[12.5px] outline-none"
          />
        ) : (
          <button
            onClick={() => onSelect(node.id)}
            className={`min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold ${isActive ? "text-accent-hover" : "text-slate-600"}`}
          >
            {node.name}
          </button>
        )}

        <span className="flex-none rounded-full bg-page px-1.5 text-[10px] font-bold text-slate-400 group-hover:opacity-0">{node.totalCount}</span>
        <div className="relative -ml-6 group-hover:ml-0">
          <button
            onClick={() => onMenu(menuId === node.id ? null : node.id)}
            disabled={busy}
            className="flex h-5 w-5 flex-none items-center justify-center rounded text-[13px] text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-200 disabled:opacity-30"
          >
            ⋯
          </button>
          {menuId === node.id && (
            <FolderMenu
              node={node}
              flat={flat}
              onClose={() => onMenu(null)}
              onRename={() => {
                onMenu(null);
                onStartRename(node.id);
              }}
              onNewSub={() => onNewSub(node.id)}
              onMove={(pid) => onMove(node.id, pid)}
              onColor={(c) => onColor(node.id, c)}
              onDelete={() => onDelete(node.id, node.name)}
            />
          )}
        </div>
      </div>

      {isOpen &&
        node.children.map((c) => (
          <FolderRowView
            key={c.id}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            selected={selected}
            editingId={editingId}
            menuId={menuId}
            busy={busy}
            flat={flat}
            onToggle={onToggle}
            onSelect={onSelect}
            onStartRename={onStartRename}
            onRename={onRename}
            onCancelRename={onCancelRename}
            onMenu={onMenu}
            onNewSub={onNewSub}
            onMove={onMove}
            onColor={onColor}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

function FolderMenu({
  node,
  flat,
  onClose,
  onRename,
  onNewSub,
  onMove,
  onColor,
  onDelete,
}: {
  node: FolderNode;
  flat: { node: FolderNode; depth: number }[];
  onClose: () => void;
  onRename: () => void;
  onNewSub: () => void;
  onMove: (parentId: string | null) => void;
  onColor: (color: string) => void;
  onDelete: () => void;
}) {
  const [subMenu, setSubMenu] = useState<"move" | "color" | null>(null);
  const banned = subtreeIds(node);
  const moveTargets = flat.filter((f) => !banned.has(f.node.id));

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute right-0 z-30 mt-1 w-48 rounded-[10px] border border-border bg-surface py-1 shadow-lg">
        <MenuItem label="Renomear" onClick={onRename} />
        <MenuItem label="Nova subpasta" onClick={onNewSub} />
        <MenuItem label="Mover para…" onClick={() => setSubMenu(subMenu === "move" ? null : "move")} chevron />
        {subMenu === "move" && (
          <div className="max-h-52 overflow-auto border-y border-border-soft bg-page/60 py-1">
            <button onClick={() => onMove(null)} className="block w-full px-4 py-1.5 text-left text-[12px] font-semibold text-slate-600 hover:bg-accent-soft">
              ⤴ Raiz (sem pasta-pai)
            </button>
            {moveTargets.map(({ node: t, depth }) => (
              <button
                key={t.id}
                onClick={() => onMove(t.id)}
                className="block w-full truncate px-4 py-1.5 text-left text-[12px] text-slate-600 hover:bg-accent-soft"
                style={{ paddingLeft: 16 + depth * 12 }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
        <MenuItem label="Cor" onClick={() => setSubMenu(subMenu === "color" ? null : "color")} chevron />
        {subMenu === "color" && (
          <div className="flex gap-1.5 px-4 py-2">
            {FOLDER_COLORS.map((c) => (
              <button key={c} onClick={() => onColor(c)} className="h-5 w-5 rounded-full border border-white shadow" style={{ background: c }} />
            ))}
          </div>
        )}
        <div className="my-1 border-t border-border-soft" />
        <MenuItem label="Excluir" danger onClick={onDelete} />
      </div>
    </>
  );
}

function MenuItem({ label, onClick, danger, chevron }: { label: string; onClick: () => void; danger?: boolean; chevron?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-[12.5px] font-semibold hover:bg-page ${danger ? "text-danger-strong" : "text-slate-700"}`}
    >
      {label}
      {chevron && <span className="text-[10px] text-slate-400">▸</span>}
    </button>
  );
}

function MoveMenu({
  current,
  flat,
  disabled,
  onMove,
}: {
  current: string | null;
  flat: { node: FolderNode; depth: number }[];
  disabled: boolean;
  onMove: (folderId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-border text-slate-400 hover:bg-page hover:text-slate-600 disabled:opacity-40"
        title="Mover para pasta"
      >
        <MoveIcon />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 max-h-60 w-52 overflow-auto rounded-[10px] border border-border bg-surface py-1 shadow-lg">
            <div className="px-3 py-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase">Mover para</div>
            <button
              onClick={() => {
                setOpen(false);
                onMove(null);
              }}
              className={`block w-full px-4 py-1.5 text-left text-[12px] font-semibold hover:bg-accent-soft ${current == null ? "text-accent-hover" : "text-slate-600"}`}
            >
              Sem pasta
            </button>
            {flat.map(({ node, depth }) => (
              <button
                key={node.id}
                onClick={() => {
                  setOpen(false);
                  onMove(node.id);
                }}
                className={`block w-full truncate px-4 py-1.5 text-left text-[12px] hover:bg-accent-soft ${current === node.id ? "font-bold text-accent-hover" : "text-slate-600"}`}
                style={{ paddingLeft: 16 + depth * 12 }}
              >
                {node.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BulkMoveMenu({ flat, disabled, onMove }: { flat: { node: FolderNode; depth: number }[]; disabled: boolean; onMove: (folderId: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:bg-accent-hover disabled:opacity-50"
      >
        <MoveIcon /> Mover para…
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1 max-h-60 w-52 overflow-auto rounded-[10px] border border-border bg-surface py-1 shadow-lg">
            <button
              onClick={() => {
                setOpen(false);
                onMove(null);
              }}
              className="block w-full px-4 py-1.5 text-left text-[12px] font-semibold text-slate-600 hover:bg-accent-soft"
            >
              Sem pasta
            </button>
            {flat.map(({ node, depth }) => (
              <button
                key={node.id}
                onClick={() => {
                  setOpen(false);
                  onMove(node.id);
                }}
                className="block w-full truncate px-4 py-1.5 text-left text-[12px] text-slate-600 hover:bg-accent-soft"
                style={{ paddingLeft: 16 + depth * 12 }}
              >
                {node.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Ícones ---------- */

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function StackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" />
    </svg>
  );
}
function InboxIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}
function FolderIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M6 14 3 21h15l3-7H6Z" /><path d="M3 21V5a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v1" fill="none" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l3 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function TableIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function MoveIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l3 3h7a2 2 0 0 1 2 2v3" /><path d="M15 17h6m0 0-2.5-2.5M21 17l-2.5 2.5" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function CheckSquareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" />
    </svg>
  );
}
function ChevronMini() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
